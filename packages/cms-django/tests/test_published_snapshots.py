from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import Category, ContentEntry, ContentTypeDefinition, PublishedEntry, Tag
from digitalafarin_cms.apps.seo.models import Redirect, SchemaMarkup, SeoMeta
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class PublishedSnapshotTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Frozen Org", slug="frozen-org")
        self.site = Site.objects.create(organization=self.org, name="Frozen", domain="frozen.test")
        self.user = get_user_model().objects.create_user(username="frozen-owner", password="x")
        Membership.objects.create(organization=self.org, user=self.user, role=Membership.Role.OWNER)
        self.kind = ContentTypeDefinition.objects.create(site=self.site, name="Post", slug="post")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.public = APIClient()

    def create(self, **overrides):
        payload = {
            "site": str(self.site.pk), "content_type": str(self.kind.pk), "title": "Live title",
            "slug": "old", "path": "/old/", "path_mode": "manual", "status": "draft",
            "excerpt": "Original excerpt", "blocks": [{"id": "p-1", "type": "paragraph", "data": {"text": "Old body"}}],
        }
        payload.update(overrides)
        result = self.client.post("/api/cms/v1/content/entries/", payload, format="json")
        self.assertEqual(result.status_code, 201, result.data)
        return ContentEntry.objects.get(pk=result.data["id"])

    def workflow(self, entry, action):
        return self.client.post(f"/api/cms/v1/content/entries/{entry.pk}/{action}/", {}, format="json")

    def resolve(self, path):
        return self.public.get("/api/cms/v1/content/resolve/", {"site": "frozen.test", "path": path})

    def listing(self, **params):
        return self.public.get("/api/cms/v1/content/public-entries/", {"site": "frozen.test", **params})

    def test_body_metadata_and_route_remain_live_until_republish(self):
        entry = self.create()
        seo = SeoMeta.objects.create(entry=entry, title="Old SEO", description="Previous description")
        schema = SchemaMarkup.objects.create(entry=entry, schema_type="Article", data={"headline": "Old headline"})
        published = self.workflow(entry, "publish")
        self.assertEqual(published.status_code, 200, published.data)
        self.assertEqual(self.resolve("/old/").data["seo"]["title"], "Old SEO")
        self.assertEqual(self.resolve("/old/").data["schemas"][0]["data"]["headline"], "Old headline")

        edited = self.client.patch(f"/api/cms/v1/content/entries/{entry.pk}/", {
            "title": "Draft title", "path": "/new/", "excerpt": "Edited excerpt",
            "blocks": [{"id": "p-1", "type": "paragraph", "data": {"text": "Draft body"}}],
        }, format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        seo.title = "Draft SEO"
        seo.save(update_fields=["title"])
        schema.data = {"headline": "Draft headline"}
        schema.save(update_fields=["data"])

        live = self.resolve("/old/")
        self.assertEqual(live.status_code, 200, live.data)
        self.assertEqual(live.data["content"]["title"], "Live title")
        self.assertEqual(live.data["blocks"][0]["data"]["text"], "Old body")
        self.assertEqual(live.data["seo"]["title"], "Old SEO")
        self.assertEqual(live.data["schemas"][0]["data"]["headline"], "Old headline")
        self.assertEqual(self.resolve("/new/").status_code, 404)
        self.assertEqual(self.listing(search="Draft title").data["count"], 0)
        self.assertEqual(self.listing(search="Live title").data["count"], 1)
        self.assertFalse(Redirect.objects.filter(site=self.site, source_path="/old/").exists())

        self.assertEqual(self.workflow(entry, "publish").status_code, 200)
        self.assertEqual(self.resolve("/old/").status_code, 404)
        new_live = self.resolve("/new/")
        self.assertEqual(new_live.status_code, 200, new_live.data)
        self.assertEqual(new_live.data["content"]["title"], "Draft title")
        self.assertEqual(new_live.data["blocks"][0]["data"]["text"], "Draft body")
        self.assertEqual(new_live.data["seo"]["title"], "Draft SEO")
        self.assertEqual(new_live.data["schemas"][0]["data"]["headline"], "Draft headline")
        self.assertEqual(Redirect.objects.get(site=self.site, source_path="/old/").destination_path, "/new/")

    def test_categories_and_tags_are_frozen_for_public_filters(self):
        entry = self.create()
        category = Category.objects.create(site=self.site, name="Guides", slug="guides")
        tag = Tag.objects.create(site=self.site, name="Old tag", slug="old-tag")
        entry.categories.add(category)
        entry.tags.add(tag)
        self.assertEqual(self.workflow(entry, "publish").status_code, 200)
        self.assertEqual(self.listing(category="guides", tag="old-tag").data["count"], 1)
        entry.categories.clear()
        entry.tags.clear()
        self.assertEqual(self.listing(category="guides", tag="old-tag").data["count"], 1)
        self.assertEqual(self.listing().data["results"][0]["categories"][0]["slug"], "guides")
        self.assertEqual(self.workflow(entry, "publish").status_code, 200)
        self.assertEqual(self.listing(category="guides").data["count"], 0)

    def test_unpublish_removes_public_copy_but_keeps_editorial_data(self):
        entry = self.create()
        self.workflow(entry, "publish")
        self.assertTrue(PublishedEntry.objects.filter(entry=entry).exists())
        result = self.workflow(entry, "return-draft")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.resolve("/old/").status_code, 404)
        self.assertFalse(PublishedEntry.objects.filter(entry=entry).exists())
        self.assertTrue(ContentEntry.objects.filter(pk=entry.pk).exists())

    def test_robots_and_sitemap_use_published_snapshot(self):
        entry = self.create()
        seo = SeoMeta.objects.create(entry=entry, robots_index=True)
        self.workflow(entry, "publish")
        self.assertIn("/old/", self.public.get("/api/cms/v1/content/sitemap/", {"site": self.site.domain}).content.decode())
        seo.robots_index = False
        seo.save(update_fields=["robots_index"])
        self.assertIn("/old/", self.public.get("/api/cms/v1/content/sitemap/", {"site": self.site.domain}).content.decode())
        self.workflow(entry, "publish")
        self.assertNotIn("/old/", self.public.get("/api/cms/v1/content/sitemap/", {"site": self.site.domain}).content.decode())

    def test_new_direct_published_entries_get_snapshot_for_legacy_importers(self):
        entry = ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title="Imported", slug="imported",
            path="/imported/", status="published",
        )
        self.assertTrue(PublishedEntry.objects.filter(entry=entry).exists())
        self.assertIsNotNone(entry.published_at)
        self.assertEqual(self.resolve("/imported/").data["content"]["title"], "Imported")


    def test_live_route_cannot_be_taken_over_by_another_draft(self):
        entry = self.create()
        self.assertEqual(self.workflow(entry, "publish").status_code, 200)
        renamed = self.client.patch(f"/api/cms/v1/content/entries/{entry.pk}/", {
            "path": "/new/", "slug": "new",
        }, format="json")
        self.assertEqual(renamed.status_code, 200, renamed.data)
        conflict = self.client.post("/api/cms/v1/content/entries/", {
            "site": str(self.site.pk), "content_type": str(self.kind.pk),
            "title": "Hijacker", "slug": "hijack", "path": "/old/", "path_mode": "manual",
            "status": "draft",
        }, format="json")
        self.assertEqual(conflict.status_code, 400)
        self.assertIn("path", conflict.data)
        self.assertEqual(self.resolve("/old/").data["content"]["title"], "Live title")

    def test_published_status_cannot_be_bypassed_by_direct_patch(self):
        entry = self.create()
        self.workflow(entry, "publish")
        result = self.client.patch(f"/api/cms/v1/content/entries/{entry.pk}/", {
            "status": "draft",
        }, format="json")
        self.assertEqual(result.status_code, 403)
        self.assertEqual(self.resolve("/old/").status_code, 200)

    def test_workflow_reports_live_snapshot_and_unpublished_changes(self):
        entry = self.create()
        self.workflow(entry, "publish")
        url = f"/api/cms/v1/content/entries/{entry.pk}/workflow/"
        first = self.client.get(url)
        self.assertTrue(first.data["has_live_version"])
        self.assertFalse(first.data["has_unpublished_changes"])
        self.client.patch(f"/api/cms/v1/content/entries/{entry.pk}/", {
            "title": "Later title",
        }, format="json")
        second = self.client.get(url)
        self.assertTrue(second.data["has_unpublished_changes"])
        self.assertEqual(second.data["live_path"], "/old/")
        self.assertEqual(self.resolve("/old/").data["content"]["title"], "Live title")
