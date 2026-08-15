from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.audit.crawler import FetchResult, analyze_fetch, normalize_url
from digitalafarin_cms.apps.audit.models import AuditIssue, AuditPage, AuditRun
from digitalafarin_cms.apps.audit.services import execute_audit
from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class AuditCrawlerTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="audit-owner", password="x")
        self.org = Organization.objects.create(name="Audit Org", slug="audit-org")
        self.site = Site.objects.create(organization=self.org, name="Audit Site", domain="audit.example")
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        self.content_type = ContentTypeDefinition.objects.create(
            site=self.site,
            name="Page",
            slug="page",
            is_public=True,
        )
        for title, slug, path in [
            ("Home", "home", "/"),
            ("About", "about", "/about/"),
            ("Orphan", "orphan", "/orphan/"),
        ]:
            ContentEntry.objects.create(
                site=self.site,
                content_type=self.content_type,
                title=title,
                slug=slug,
                path=path,
                status=ContentEntry.Status.PUBLISHED,
            )

    def fake_fetch(self, url):
        pages = {
            "https://audit.example/": """
                <html><head>
                <title>DigitalAfarin Audit Example Home Page</title>
                <meta name="description" content="A useful homepage description that is intentionally long enough for the SEO audit engine to accept without a short-description warning.">
                <link rel="canonical" href="https://audit.example/">
                </head><body>
                <h1>Home</h1>
                <p>This page contains enough repeated useful content words for parsing but it is still intentionally under the thin-content threshold.</p>
                <a href="/about/?utm_source=test#section">About</a>
                <a href="/broken/">Broken</a>
                <img src="/hero.jpg">
                </body></html>
            """,
            "https://audit.example/about/": """
                <html><head>
                <title>DigitalAfarin Audit Example Home Page</title>
                <link rel="canonical" href="https://audit.example/about/">
                </head><body><p>About page body.</p><a href="/">Home</a></body></html>
            """,
            "https://audit.example/orphan/": """
                <html><head>
                <title>Orphan Published Page With Valid Title</title>
                <meta name="description" content="This orphan page has a valid description that is sufficiently descriptive for testing the technical SEO auditing workflow.">
                <meta name="robots" content="noindex,follow">
                <link rel="canonical" href="https://audit.example/orphan/">
                </head><body><h1>Orphan</h1><p>Orphan body.</p></body></html>
            """,
            "https://audit.example/broken/": "<html><head><title>Not Found</title></head><body><h1>404</h1></body></html>",
        }
        status = 404 if url.endswith("/broken/") else 200
        return FetchResult(
            url=url,
            final_url=url,
            status_code=status,
            content_type="text/html",
            body=pages[url],
            response_ms=250,
            headers={"content-type": "text/html"},
        )

    def test_audit_crawls_discovered_pages_and_builds_issue_graph(self):
        run = AuditRun.objects.create(site=self.site, max_pages=20)
        result = execute_audit(run, fetcher=self.fake_fetch)
        run.refresh_from_db()

        self.assertEqual(run.status, AuditRun.Status.DONE)
        self.assertEqual(result["pages"], 4)
        self.assertEqual(run.pages_crawled, 4)
        self.assertLess(run.health_score, 100)

        codes = set(AuditIssue.objects.filter(run=run).values_list("code", flat=True))
        self.assertIn("http_4xx", codes)
        self.assertIn("broken_internal_link", codes)
        self.assertIn("duplicate_title", codes)
        self.assertIn("missing_meta_description", codes)
        self.assertIn("images_missing_alt", codes)
        self.assertIn("orphan_page", codes)
        self.assertIn("noindex", codes)

        about = AuditPage.objects.get(run=run, url="https://audit.example/about/")
        broken = AuditPage.objects.get(run=run, url="https://audit.example/broken/")
        orphan = AuditPage.objects.get(run=run, url="https://audit.example/orphan/")
        self.assertGreaterEqual(about.incoming_internal_links, 1)
        self.assertEqual(broken.status_code, 404)
        self.assertFalse(orphan.is_indexable)
        self.assertGreater(orphan.issue_count, 0)
        self.assertEqual(run.summary["status_codes"]["404"], 1)
        self.assertGreater(run.summary["errors"], 0)

    def test_url_normalization_drops_query_fragments_and_assets(self):
        self.assertEqual(
            normalize_url("https://audit.example/", "/about/?utm_source=x#team", "audit.example"),
            "https://audit.example/about/",
        )
        self.assertIsNone(normalize_url("https://audit.example/", "/image.jpg", "audit.example"))
        self.assertIsNone(normalize_url("https://audit.example/", "mailto:test@example.com", "audit.example"))
        self.assertIsNone(normalize_url("https://audit.example/", "https://other.example/page/", "audit.example"))

    def test_parser_extracts_indexability_headings_links_and_images(self):
        fetch = FetchResult(
            url="https://audit.example/page/",
            final_url="https://audit.example/page/",
            status_code=200,
            content_type="text/html",
            body="""
                <html><head><title>Example</title><meta name="robots" content="noindex,nofollow"></head>
                <body><h1>A</h1><h2>B</h2><img src="x" alt=""><a href="/next/">Next</a><a href="https://external.example/">External</a></body></html>
            """,
            response_ms=10,
        )
        page = analyze_fetch(fetch, "audit.example")
        self.assertFalse(page.is_indexable)
        self.assertEqual(page.h1_count, 1)
        self.assertEqual(page.h2_count, 1)
        self.assertEqual(page.image_count, 1)
        self.assertEqual(page.missing_alt_count, 1)
        self.assertEqual(page.internal_urls, ["https://audit.example/next/"])
        self.assertEqual(page.external_urls, ["https://external.example/"])


class AuditApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="audit-api-owner", password="x")
        self.viewer = User.objects.create_user(username="audit-api-viewer", password="x")
        self.org = Organization.objects.create(name="Audit API Org", slug="audit-api-org")
        self.site = Site.objects.create(organization=self.org, name="Audit API", domain="audit-api.example")
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.viewer, role=Membership.Role.VIEWER)

    def auth_client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    @patch("digitalafarin_cms.apps.audit.views.run_audit.delay")
    def test_owner_can_start_audit(self, delay):
        response = self.auth_client(self.owner).post(
            "/api/cms/v1/audit/runs/start/",
            {"site": str(self.site.id), "max_pages": 25},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["max_pages"], 25)
        self.assertEqual(response.data["status"], "queued")
        delay.assert_called_once()

    @patch("digitalafarin_cms.apps.audit.views.run_audit.delay")
    def test_viewer_cannot_start_audit(self, delay):
        response = self.auth_client(self.viewer).post(
            "/api/cms/v1/audit/runs/start/",
            {"site": str(self.site.id), "max_pages": 25},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        delay.assert_not_called()

    def test_max_pages_is_bounded(self):
        response = self.auth_client(self.owner).post(
            "/api/cms/v1/audit/runs/",
            {"site": str(self.site.id), "max_pages": 501},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
