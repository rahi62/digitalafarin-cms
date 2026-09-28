from unittest.mock import patch
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import Category, ContentEntry, ContentTypeDefinition, Tag
from digitalafarin_cms.apps.seo.models import Redirect
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class HostIntegrationTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Host", slug="host")
        self.site = Site.objects.create(organization=self.org, name="Host", domain="host.test")
        self.user = get_user_model().objects.create_user(username="owner")
        Membership.objects.create(organization=self.org, user=self.user, role="owner")
        self.admin = APIClient()
        self.admin.force_authenticate(self.user)
        self.public = APIClient()
        response = self.admin.post("/api/cms/v1/content/types/", {
            "site": str(self.site.pk), "name": "News", "slug": "news",
            "collection_path": "/blog", "entry_path_pattern": "/blog/{slug}/",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.kind = ContentTypeDefinition.objects.get(pk=response.data["id"])

    def create(self, **kwargs):
        data = {"site": str(self.site.pk), "content_type": str(self.kind.pk),
                "title": "Article", "slug": "article", **kwargs}
        return self.admin.post("/api/cms/v1/content/entries/", data, format="json")

    def resolve(self, path, **kwargs):
        return self.public.get("/api/cms/v1/content/resolve/", {"site": self.site.domain, "path": path, **kwargs})

    def listing(self, **kwargs):
        return self.public.get("/api/cms/v1/content/public-entries/", {"site": self.site.domain, **kwargs})

    def test_generated_unicode_path_preview_publish_list_rename_and_unpublish(self):
        created = self.create(slug="مقاله", path="/blog/")
        self.assertEqual(created.status_code, 201, created.data)
        entry_id = created.data["id"]
        path = "/blog/مقاله/"
        self.assertEqual(created.data["path"], path)
        self.assertEqual(created.data["path_mode"], "auto")
        self.assertEqual(self.listing().data["count"], 0)
        self.assertEqual(self.resolve(path).status_code, 404)
        token = self.admin.post(f"/api/cms/v1/content/entries/{entry_id}/preview/").data["token"]
        preview = self.resolve(path, preview=token)
        self.assertEqual(preview.status_code, 200)
        self.assertIn("no-store", preview["Cache-Control"])
        self.assertEqual(preview["Referrer-Policy"], "no-referrer")
        self.assertIn("noindex", preview["X-Robots-Tag"])
        self.admin.post(f"/api/cms/v1/content/entries/{entry_id}/publish/")
        listed = self.listing(content_type="news", search="Article", page_size=1)
        self.assertEqual(listed.data["count"], 1)
        self.assertEqual(listed.data["results"][0]["path"], path)
        self.assertEqual(self.resolve(quote(path)).status_code, 200)
        renamed = self.admin.patch(f"/api/cms/v1/content/entries/{entry_id}/", {"slug": "new"}, format="json")
        self.assertEqual(renamed.status_code, 200, renamed.data)
        self.assertEqual(renamed.data["path"], "/blog/new/")
        self.assertEqual(Redirect.objects.get(site=self.site, source_path=path).destination_path, "/blog/new/")
        self.assertEqual(self.resolve("/blog/new/", preview=token).status_code, 403)
        self.admin.post(f"/api/cms/v1/content/entries/{entry_id}/return-draft/")
        self.assertEqual(self.listing().data["count"], 0)
        self.assertEqual(self.resolve("/blog/new/").status_code, 404)

    def test_manual_paths_survive_and_reserved_or_duplicate_paths_fail(self):
        created = self.create(path="/custom/", path_mode="manual")
        self.assertEqual(created.status_code, 201, created.data)
        response = self.admin.patch(f'/api/cms/v1/content/entries/{created.data["id"]}/', {"slug": "changed"}, format="json")
        self.assertEqual(response.data["path"], "/custom/")
        self.assertEqual(self.create(slug="duplicate", path="/%63ustom/", path_mode="manual").status_code, 400)
        for path in ["/media/a.png", "/api/test", "/_next/static/x", "/blog", "/a/../b", "/a%2fb", "/a%252fb"]:
            with self.subTest(path=path):
                self.assertEqual(self.create(path=path, path_mode="manual").status_code, 400)

    def test_collection_claims_are_site_wide_and_do_not_displace_existing_pages(self):
        pages = ContentTypeDefinition.objects.create(site=self.site, name="Page", slug="page")
        response = self.create(content_type=str(pages.pk), path="/blog/", path_mode="manual")
        self.assertEqual(response.status_code, 400)
        self.create(content_type=str(pages.pk), slug="existing", path="/existing/", path_mode="manual")
        for collection in ["/blog", "/existing"]:
            result = self.admin.post("/api/cms/v1/content/types/", {"site": str(self.site.pk), "name": "Other", "slug": "other", "collection_path": collection, "entry_path_pattern": collection + "/{slug}/"}, format="json")
            self.assertEqual(result.status_code, 400, result.data)

    def test_unicode_old_url_redirect_accepts_encoded_slash_variants(self):
        entry = self.create(slug="قدیمی").data
        self.admin.post(f'/api/cms/v1/content/entries/{entry["id"]}/publish/')
        self.admin.patch(f'/api/cms/v1/content/entries/{entry["id"]}/', {"slug": "new"}, format="json")
        response = self.public.get("/api/cms/v1/seo/redirect-resolve/", {"site": self.site.domain, "path": quote(entry["path"].rstrip("/"))})
        self.assertTrue(response.data["match"])
        self.assertEqual(response.data["destination"], "/blog/new/")

    def test_legacy_slashless_path_preview_works_through_canonical_route(self):
        entry = self.create(path="/legacy/", path_mode="manual").data
        ContentEntry.objects.filter(pk=entry["id"]).update(path="/legacy")
        token = self.admin.post(f'/api/cms/v1/content/entries/{entry["id"]}/preview/').data["token"]
        self.assertEqual(self.resolve("/legacy/", preview=token).status_code, 200)

    def test_encoded_legacy_public_path_and_redirect_claim(self):
        entry = self.create(slug="مقاله").data
        self.admin.post(f'/api/cms/v1/content/entries/{entry["id"]}/publish/')
        ContentEntry.objects.filter(pk=entry["id"]).update(path=quote(entry["path"]))
        self.assertEqual(self.resolve(entry["path"]).status_code, 200)
        Redirect.objects.create(site=self.site, source_path="/claimed", destination_path="/elsewhere/")
        self.assertEqual(self.create(slug="claim", path="/claimed/", path_mode="manual").status_code, 400)

    def test_public_visibility_and_bounded_pagination(self):
        public_entry = self.create().data
        self.admin.post(f'/api/cms/v1/content/entries/{public_entry["id"]}/publish/')
        hidden = ContentTypeDefinition.objects.create(site=self.site, name="Private", slug="private", is_public=False)
        ContentEntry.objects.create(site=self.site, content_type=hidden, title="Secret", slug="secret", path="/secret/", status="published")
        other_org = Organization.objects.create(name="Other", slug="other")
        other = Site.objects.create(organization=other_org, name="Other", domain="other.test")
        other_type = ContentTypeDefinition.objects.create(site=other, name="News", slug="news")
        ContentEntry.objects.create(site=other, content_type=other_type, title="Other", slug="other", path="/other/", status="published")
        result = self.listing()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["count"], 1)
        self.assertNotIn("author", result.data["results"][0])
        self.assertEqual(self.listing(page_size=100000).status_code, 400)
        self.assertEqual(self.listing(page=0).status_code, 400)
        self.assertEqual(self.resolve("/secret/").status_code, 404)
        self.assertEqual(self.resolve("/other/").status_code, 404)

    def test_public_search_taxonomy_and_pagination_are_site_scoped(self):
        category = Category.objects.create(site=self.site, name="Guides", slug="guides")
        tag = Tag.objects.create(site=self.site, name="SEO", slug="seo")
        first = self.create(title="SEO first", slug="first").data
        second = self.create(title="Other second", slug="second").data
        for item in [first, second]:
            self.admin.post(f'/api/cms/v1/content/entries/{item["id"]}/publish/')
        entry = ContentEntry.objects.get(pk=first["id"])
        entry.categories.add(category)
        entry.tags.add(tag)

        searched = self.listing(content_type="news", search="SEO")
        self.assertEqual(searched.data["count"], 1)
        self.assertEqual(searched.data["results"][0]["id"], first["id"])

        categorized = self.listing(category="guides")
        self.assertEqual(categorized.data["count"], 1)
        self.assertEqual(categorized.data["results"][0]["id"], first["id"])

        tagged = self.listing(tag="seo")
        self.assertEqual(tagged.data["count"], 1)
        self.assertEqual(tagged.data["results"][0]["id"], first["id"])

        page1 = self.listing(page=1, page_size=1)
        page2 = self.listing(page=2, page_size=1)
        self.assertEqual(page1.data["count"], 2)
        self.assertEqual(page1.data["next"], 2)
        self.assertIsNone(page1.data["previous"])
        self.assertEqual(page2.data["previous"], 1)
        self.assertIsNone(page2.data["next"])
        self.assertNotEqual(page1.data["results"][0]["id"], page2.data["results"][0]["id"])

    def test_invalid_empty_expired_and_wrong_path_preview_never_falls_back(self):
        entry = self.create().data
        self.admin.post(f'/api/cms/v1/content/entries/{entry["id"]}/publish/')
        for token in ["", "invalid"]:
            response = self.resolve(entry["path"], preview=token)
            self.assertEqual(response.status_code, 403)
            self.assertIn("no-store", response["Cache-Control"])
        with patch("django.core.signing.time.time", return_value=1):
            token = self.admin.post(f'/api/cms/v1/content/entries/{entry["id"]}/preview/').data["token"]
        self.assertEqual(self.resolve(entry["path"], preview=token).status_code, 403)

    @override_settings(DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL="https://cdn.test/assets/")
    def test_nested_media_is_normalized_without_changing_stored_content(self):
        blocks = [{"type": "rich_text", "data": {"format": "tiptap-json", "doc": {
            "type": "doc", "content": [{"type": "image", "attrs": {"src": "/media/cms/image.png"}}]},
            "html": '<p><img src="/media/cms/image.png"></p>'}}]
        created = self.create(blocks=blocks, custom_fields={"featured_image": "/media/cms/image.png"}).data
        self.admin.post(f'/api/cms/v1/content/entries/{created["id"]}/publish/')
        page = self.resolve(created["path"]).data
        self.assertEqual(page["blocks"][0]["data"]["doc"]["content"][0]["attrs"]["src"], "https://cdn.test/assets/cms/image.png")
        self.assertEqual(page["content"]["custom_fields"]["featured_image"], "https://cdn.test/assets/cms/image.png")
        self.assertEqual(ContentEntry.objects.get(pk=created["id"]).blocks, blocks)
