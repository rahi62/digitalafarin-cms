from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from digitalafarin_cms.apps.audit.models import AuditIssue, AuditPage, AuditRun
from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.integrations.models import SearchPerformanceDaily
from digitalafarin_cms.apps.seo.models import SeoMeta
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class SeoOpportunityTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="opportunity-owner", password="x")
        self.outsider = User.objects.create_user(username="opportunity-outsider", password="x")
        self.org = Organization.objects.create(name="Opportunity Org", slug="opportunity-org")
        self.site = Site.objects.create(
            organization=self.org,
            name="Opportunity Site",
            domain="opportunity.example",
        )
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        self.content_type = ContentTypeDefinition.objects.create(
            site=self.site,
            name="Page",
            slug="page",
            is_public=True,
        )
        self.entry = ContentEntry.objects.create(
            site=self.site,
            content_type=self.content_type,
            title="SEO Guide",
            slug="seo-guide",
            path="/seo-guide/",
            status=ContentEntry.Status.PUBLISHED,
            author=self.owner,
        )
        self.healthy = ContentEntry.objects.create(
            site=self.site,
            content_type=self.content_type,
            title="Healthy Page",
            slug="healthy",
            path="/healthy/",
            status=ContentEntry.Status.PUBLISHED,
            author=self.owner,
        )
        ContentEntry.objects.filter(pk=self.entry.pk).update(
            updated_at=timezone.now() - timedelta(days=240)
        )
        self.entry.refresh_from_db()

        SeoMeta.objects.create(
            entry=self.entry,
            title="SEO Guide",
            description="",
            focus_keyword="seo guide",
            seo_score=35,
        )
        SeoMeta.objects.create(
            entry=self.healthy,
            title="Healthy Page | Brand",
            description="A sufficiently complete description for a healthy page in this test case.",
            focus_keyword="healthy page",
            seo_score=95,
        )

        SearchPerformanceDaily.objects.create(
            site=self.site,
            entry=self.entry,
            date=date(2026, 6, 15),
            path=self.entry.path,
            clicks=100,
            impressions=1000,
            ctr=0.10,
            position=4.0,
        )
        SearchPerformanceDaily.objects.create(
            site=self.site,
            entry=self.entry,
            date=date(2026, 7, 15),
            path=self.entry.path,
            clicks=50,
            impressions=950,
            ctr=50 / 950,
            position=7.0,
        )

        run = AuditRun.objects.create(
            site=self.site,
            status=AuditRun.Status.DONE,
            started_at=timezone.now() - timedelta(minutes=5),
            finished_at=timezone.now(),
            pages_crawled=2,
            health_score=72,
        )
        page = AuditPage.objects.create(
            run=run,
            url="https://opportunity.example/seo-guide/",
            final_url="https://opportunity.example/seo-guide/",
            path=self.entry.path,
            status_code=200,
            content_type="text/html",
            is_indexable=True,
            word_count=800,
            incoming_internal_links=0,
            issue_count=1,
        )
        AuditPage.objects.create(
            run=run,
            url="https://opportunity.example/healthy/",
            final_url="https://opportunity.example/healthy/",
            path=self.healthy.path,
            status_code=200,
            content_type="text/html",
            is_indexable=True,
            word_count=900,
            incoming_internal_links=3,
            issue_count=0,
        )
        AuditIssue.objects.create(
            run=run,
            page=page,
            url="https://opportunity.example/seo-guide/",
            code="broken_internal_link",
            severity=AuditIssue.Severity.ERROR,
            title="Broken internal link",
            details={"target": "/missing/"},
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_combines_search_audit_links_and_meta_into_prioritized_actions(self):
        response = self.client_for(self.owner).get(
            "/api/cms/v1/seo/opportunities/",
            {
                "site": str(self.site.id),
                "current_days": 28,
                "min_impressions": 100,
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["summary"]["total"], 1)
        opportunity = response.data["results"][0]
        self.assertEqual(opportunity["entry"]["id"], str(self.entry.id))
        self.assertEqual(opportunity["priority"], "high")
        self.assertGreaterEqual(opportunity["score"], 65)
        self.assertEqual(opportunity["metrics"]["audit_errors"], 1)
        self.assertEqual(opportunity["metrics"]["incoming_internal_links"], 0)
        self.assertLess(opportunity["metrics"]["search"]["delta"]["clicks_pct"], -40)

        action_types = {action["type"] for action in opportunity["actions"]}
        self.assertIn("refresh_content", action_types)
        self.assertIn("fix_technical", action_types)
        self.assertIn("strengthen_internal_links", action_types)
        self.assertIn("improve_on_page_seo", action_types)
        self.assertNotIn(str(self.healthy.id), {item["entry"]["id"] for item in response.data["results"]})

    def test_include_low_can_surface_freshness_only_items(self):
        ContentEntry.objects.filter(pk=self.healthy.pk).update(
            updated_at=timezone.now() - timedelta(days=400)
        )
        response = self.client_for(self.owner).get(
            "/api/cms/v1/seo/opportunities/",
            {"site": str(self.site.id), "include_low": "true"},
        )
        self.assertEqual(response.status_code, 200, response.data)
        by_id = {item["entry"]["id"]: item for item in response.data["results"]}
        self.assertIn(str(self.healthy.id), by_id)
        actions = {action["type"] for action in by_id[str(self.healthy.id)]["actions"]}
        self.assertIn("review_freshness", actions)
        self.assertEqual(by_id[str(self.healthy.id)]["priority"], "low")

    def test_other_tenant_cannot_read_site_opportunities(self):
        other_org = Organization.objects.create(name="Other Org", slug="opportunity-other")
        Membership.objects.create(
            organization=other_org,
            user=self.outsider,
            role=Membership.Role.OWNER,
        )
        response = self.client_for(self.outsider).get(
            "/api/cms/v1/seo/opportunities/",
            {"site": str(self.site.id)},
        )
        self.assertEqual(response.status_code, 403)

    def test_invalid_site_identifier_returns_404(self):
        response = self.client_for(self.owner).get(
            "/api/cms/v1/seo/opportunities/",
            {"site": "not-a-uuid"},
        )
        self.assertEqual(response.status_code, 404)
