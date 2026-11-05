import re
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition, Menu
from digitalafarin_cms.apps.content.publication import publish_snapshot
from digitalafarin_cms.apps.seo.models import Redirect
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site

PUBLIC = re.compile(r"^public, max-age=0, s-maxage=(\d+), stale-while-revalidate=(\d+)$")
BASE = "/api/cms/v1/"


class PublicCacheHeaderTests(TestCase):
    def setUp(self):
        org = Organization.objects.create(name="Cache", slug="cache")
        self.site = Site.objects.create(organization=org, name="Cache", domain="cache.example")
        self.kind = ContentTypeDefinition.objects.create(site=self.site, name="Post", slug="post")
        self.entry = ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title="Hello", slug="hello", path="/hello/", status="published")
        publish_snapshot(self.entry)
        Menu.objects.create(site=self.site, name="Main", key="main")
        self.client = APIClient()

    def resolve(self, **extra):
        return self.client.get(BASE + "content/resolve/", {"site": "cache.example", "path": "/hello/"}, **extra)

    def test_successful_public_responses_are_shared_cacheable_with_etag(self):
        calls = {
            "resolve": ("content/resolve/", {"site": "cache.example", "path": "/hello/"}),
            "entries": ("content/public-entries/", {"site": "cache.example"}),
            "menu": ("content/menu-resolve/", {"site": "cache.example", "key": "main"}),
            "context": ("site-context/", {"site": "cache.example"}),
            "sitemap": ("content/sitemap/", {"site": "cache.example"}),
            "robots": ("content/robots/", {"site": "cache.example"}),
            "redirect": ("seo/redirect-resolve/", {"site": "cache.example", "path": "/nothing/"}),
        }
        for name, (url, params) in calls.items():
            with self.subTest(endpoint=name):
                response = self.client.get(BASE + url, params)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response["Cache-Control"], "public, max-age=0, s-maxage=60, stale-while-revalidate=300")
                self.assertTrue(response["ETag"].startswith('W/"'))

    def test_if_none_match_returns_304_without_body(self):
        first = self.resolve()
        second = self.resolve(HTTP_IF_NONE_MATCH=first["ETag"])
        self.assertEqual(second.status_code, 304)
        self.assertEqual(second.content, b"")
        self.assertEqual(second["ETag"], first["ETag"])
        self.assertTrue(PUBLIC.match(second["Cache-Control"]))

    def test_etag_changes_when_content_changes(self):
        first = self.resolve()
        self.entry.title = "Changed"
        self.entry.save()
        publish_snapshot(self.entry)
        third = self.resolve(HTTP_IF_NONE_MATCH=first["ETag"])
        self.assertEqual(third.status_code, 200)
        self.assertNotEqual(third["ETag"], first["ETag"])

    def test_errors_are_never_cached(self):
        for params in ({"site": "cache.example", "path": "/missing/"}, {"site": "unknown.example", "path": "/"}, {}):
            with self.subTest(params=params):
                response = self.client.get(BASE + "content/resolve/", params)
                self.assertGreaterEqual(response.status_code, 400)
                self.assertEqual(response["Cache-Control"], "no-store")

    @override_settings(DIGITALAFARIN_CMS_CACHE_S_MAXAGE=120, DIGITALAFARIN_CMS_CACHE_STALE_WHILE_REVALIDATE=30)
    def test_values_are_configurable(self):
        self.assertEqual(self.resolve()["Cache-Control"], "public, max-age=0, s-maxage=120, stale-while-revalidate=30")

    @override_settings(DIGITALAFARIN_CMS_CACHE_S_MAXAGE=0)
    def test_zero_disables_shared_caching(self):
        response = self.resolve()
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertFalse(response.has_header("ETag"))

    def test_preview_is_private_no_store_and_noindex(self):
        staff = get_user_model().objects.create_superuser(username="cache-root", password="x")
        admin = APIClient()
        admin.force_authenticate(staff)
        draft = ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title="Draft", slug="draft", path="/draft/", status="draft")
        token = admin.post(f"{BASE}content/entries/{draft.pk}/preview/").data["token"]
        response = self.client.get(BASE + "content/resolve/", {"site": "cache.example", "path": "/draft/", "preview": token})
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertIn("noindex", response["X-Robots-Tag"])
        self.assertFalse(response.has_header("ETag"))
        bad = self.client.get(BASE + "content/resolve/", {"site": "cache.example", "path": "/draft/", "preview": "bad"})
        self.assertEqual(bad["Cache-Control"], "private, no-store")


class RedirectHitCounterTests(TestCase):
    def setUp(self):
        org = Organization.objects.create(name="Redir", slug="redir")
        self.site = Site.objects.create(organization=org, name="Redir", domain="redir.example")
        self.redirect = Redirect.objects.create(
            site=self.site, source_path="/old/", destination_path="/new/", redirect_type="301", is_active=True)
        self.client = APIClient()

    def lookup(self):
        return self.client.get(BASE + "seo/redirect-resolve/", {"site": "redir.example", "path": "/old/"})

    def hits(self):
        return Redirect.objects.get(pk=self.redirect.pk).hits

    def test_hits_increment_atomically_in_sql(self):
        self.assertEqual(self.lookup().data, {"match": True, "type": 301, "destination": "/new/"})
        self.lookup()
        self.assertEqual(self.hits(), 2)

    def test_stale_in_memory_value_is_not_written_back(self):
        Redirect.objects.filter(pk=self.redirect.pk).update(hits=10)
        self.lookup()
        self.assertEqual(self.hits(), 11)

    @override_settings(DIGITALAFARIN_CMS_REDIRECT_HIT_COUNTER=False)
    def test_counter_can_be_disabled(self):
        self.assertTrue(self.lookup().data["match"])
        self.assertEqual(self.hits(), 0)

    def test_counter_failure_never_breaks_lookup(self):
        with patch("django.db.models.query.QuerySet.update", side_effect=DatabaseError("locked")):
            response = self.lookup()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["destination"], "/new/")
