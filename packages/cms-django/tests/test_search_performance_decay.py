from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.integrations.models import SearchPerformanceDaily
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class SearchPerformanceDecayTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="search-owner", password="x")
        self.seo = User.objects.create_user(username="search-seo", password="x")
        self.writer = User.objects.create_user(username="search-writer", password="x")
        self.org = Organization.objects.create(name="Search Org", slug="search-org")
        self.site = Site.objects.create(
            organization=self.org,
            name="Search Site",
            domain="search.example",
            settings={"frontend_url": "https://www.search.example"},
        )
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.seo, role=Membership.Role.SEO)
        Membership.objects.create(organization=self.org, user=self.writer, role=Membership.Role.WRITER)
        self.content_type = ContentTypeDefinition.objects.create(site=self.site, name="Page", slug="page")
        self.entry = ContentEntry.objects.create(
            site=self.site,
            content_type=self.content_type,
            title="Evergreen Guide",
            slug="guide",
            path="/guide/",
            status=ContentEntry.Status.PUBLISHED,
            author=self.owner,
        )

    def auth_client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def import_payload(self, **overrides):
        payload = {
            "site": str(self.site.id),
            "provider": "manual",
            "source_label": "test export",
            "rows": [
                {
                    "date": "2026-07-01",
                    "page": "https://www.search.example/guide/?utm_source=test",
                    "clicks": 10,
                    "impressions": 100,
                    "position": 5.5,
                }
            ],
        }
        payload.update(overrides)
        return payload

    def test_seo_manager_can_import_and_rows_upsert_to_entry(self):
        client = self.auth_client(self.seo)
        response = client.post(
            "/api/cms/v1/integrations/search-performance/import/",
            self.import_payload(),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["rows_upserted"], 1)

        metric = SearchPerformanceDaily.objects.get(site=self.site, date="2026-07-01", path="/guide/")
        self.assertEqual(metric.entry_id, self.entry.id)
        self.assertEqual(metric.clicks, 10)
        self.assertAlmostEqual(metric.ctr, 0.10)

        updated = self.import_payload()
        updated["rows"][0]["clicks"] = 20
        response = client.post(
            "/api/cms/v1/integrations/search-performance/import/",
            updated,
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(SearchPerformanceDaily.objects.filter(site=self.site, path="/guide/").count(), 1)
        metric.refresh_from_db()
        self.assertEqual(metric.clicks, 20)

    def test_writer_cannot_import_search_data(self):
        response = self.auth_client(self.writer).post(
            "/api/cms/v1/integrations/search-performance/import/",
            self.import_payload(),
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(SearchPerformanceDaily.objects.count(), 0)

    def test_cross_domain_page_is_rejected(self):
        payload = self.import_payload()
        payload["rows"][0]["page"] = "https://evil.example/guide/"
        response = self.auth_client(self.owner).post(
            "/api/cms/v1/integrations/search-performance/import/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("does not belong", response.data["detail"])

    def test_decay_engine_classifies_ranking_demand_and_ctr_opportunity(self):
        seasonal = ContentEntry.objects.create(
            site=self.site,
            content_type=self.content_type,
            title="Seasonal Topic",
            slug="seasonal",
            path="/seasonal/",
            status=ContentEntry.Status.PUBLISHED,
            author=self.owner,
        )
        opportunity = ContentEntry.objects.create(
            site=self.site,
            content_type=self.content_type,
            title="CTR Opportunity",
            slug="opportunity",
            path="/opportunity/",
            status=ContentEntry.Status.PUBLISHED,
            author=self.owner,
        )
        ContentEntry.objects.filter(pk=self.entry.pk).update(updated_at=timezone.now() - timedelta(days=240))

        baseline_date = date(2026, 6, 1)
        current_date = date(2026, 7, 1)
        rows = [
            (self.entry, baseline_date, 100, 1000, 4.0),
            (self.entry, current_date, 50, 950, 7.0),
            (seasonal, baseline_date, 80, 800, 5.0),
            (seasonal, current_date, 35, 400, 5.1),
            (opportunity, baseline_date, 50, 1000, 6.0),
            (opportunity, current_date, 45, 1500, 6.1),
        ]
        for entry, metric_date, clicks, impressions, position in rows:
            SearchPerformanceDaily.objects.create(
                site=self.site,
                entry=entry,
                date=metric_date,
                path=entry.path,
                clicks=clicks,
                impressions=impressions,
                ctr=clicks / impressions,
                position=position,
            )

        response = self.auth_client(self.seo).get(
            "/api/cms/v1/integrations/search-performance/decay/",
            {"site": str(self.site.id), "current_days": 28, "baseline_days": 28, "min_impressions": 100},
        )
        self.assertEqual(response.status_code, 200, response.data)
        by_path = {item["path"]: item for item in response.data["results"]}

        guide_codes = {item["code"] for item in by_path["/guide/"]["signals"]}
        seasonal_codes = {item["code"] for item in by_path["/seasonal/"]["signals"]}
        opportunity_codes = {item["code"] for item in by_path["/opportunity/"]["signals"]}
        self.assertIn("ranking_decay", guide_codes)
        self.assertIn("content_refresh", guide_codes)
        self.assertIn("demand_decay", seasonal_codes)
        self.assertIn("ctr_opportunity", opportunity_codes)
        self.assertGreaterEqual(response.data["summary"]["ranking_decay"], 1)
        self.assertGreaterEqual(response.data["summary"]["demand_decay"], 1)
        self.assertGreaterEqual(response.data["summary"]["ctr_issues"], 1)

    def test_search_metrics_are_tenant_scoped(self):
        other_org = Organization.objects.create(name="Other", slug="search-other")
        other_site = Site.objects.create(organization=other_org, name="Other", domain="other-search.example")
        SearchPerformanceDaily.objects.create(
            site=other_site,
            date="2026-07-01",
            path="/private/",
            clicks=1,
            impressions=10,
            ctr=0.1,
            position=2,
        )
        response = self.auth_client(self.owner).get("/api/cms/v1/integrations/search-performance/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 0)
