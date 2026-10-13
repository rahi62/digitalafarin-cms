from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentTypeDefinition, ContentEntry
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class SingletonContentTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Single Org", slug="single-org")
        self.site = Site.objects.create(organization=self.organization, name="Single Site", domain="single.test")
        owner = get_user_model().objects.create_user(username="singleton-owner")
        Membership.objects.create(organization=self.organization, user=owner, role=Membership.Role.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(owner)

    def create_type(self, kind="singleton", slug="home"):
        res = self.client.post("/api/cms/v1/content/types/", {
            "site": str(self.site.pk), "name": "Home", "slug": slug, "kind": kind,
            "schema": {"fields": []},
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def make_entry(self, type_id, path="/", slug="home"):
        return self.client.post("/api/cms/v1/content/entries/", {
            "site": str(self.site.pk), "content_type": type_id,
            "title": "Homepage", "slug": slug, "path": path, "path_mode": "manual",
        }, format="json")

    def test_singleton_is_exactly_one_record_and_has_lookup(self):
        ct = self.create_type()
        first = self.make_entry(ct["id"])
        self.assertEqual(first.status_code, 201, first.data)
        row = ContentEntry.objects.get(pk=first.data["id"])
        self.assertEqual(str(row.singleton_slot_id), ct["id"])
        second = self.make_entry(ct["id"], "/another/", "another")
        self.assertEqual(second.status_code, 400, second.data)
        self.assertEqual(ContentEntry.objects.filter(content_type_id=ct["id"]).count(), 1)
        lookup = self.client.get(f"/api/cms/v1/content/types/{ct['id']}/singleton-entry/")
        self.assertEqual(lookup.status_code, 200, lookup.data)
        self.assertTrue(lookup.data["exists"])
        self.assertEqual(lookup.data["entry_id"], str(row.pk))

    def test_collections_remain_unlimited_and_existing_default(self):
        ct = self.create_type(kind="collection", slug="articles")
        self.assertEqual(self.make_entry(ct["id"], "/one/", "one").status_code, 201)
        self.assertEqual(self.make_entry(ct["id"], "/two/", "two").status_code, 201)
        self.assertEqual(ContentEntry.objects.filter(content_type_id=ct["id"]).count(), 2)
        self.assertEqual(ContentEntry.objects.filter(content_type_id=ct["id"], singleton_slot__isnull=True).count(), 2)

    def test_kind_change_blocked_after_entries_exist(self):
        ct = self.create_type()
        self.assertEqual(self.make_entry(ct["id"]).status_code, 201)
        res = self.client.patch(f"/api/cms/v1/content/types/{ct['id']}/", {
            "kind": "collection",
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("kind", res.data)

    def test_singleton_cannot_have_collection_paths_or_automatic_routing(self):
        bad = self.client.post("/api/cms/v1/content/types/", {
            "site": str(self.site.pk), "name": "Bad", "slug": "bad", "kind": "singleton",
            "collection_path": "/bad", "entry_path_pattern": "/bad/{slug}/",
        }, format="json")
        self.assertEqual(bad.status_code, 400, bad.data)
        ct = self.create_type()
        entry = self.client.post("/api/cms/v1/content/entries/", {
            "site": str(self.site.pk), "content_type": ct["id"], "title": "Bad Home",
            "slug": "bad-home", "path_mode": "auto", "path": "/",
        }, format="json")
        self.assertEqual(entry.status_code, 400)
        self.assertIn("path_mode", entry.data)

    def test_singleton_changes_keep_published_public_page_stable(self):
        ct = self.create_type()
        entry = self.make_entry(ct["id"])
        self.assertEqual(entry.status_code, 201)
        endpoint = f"/api/cms/v1/content/entries/{entry.data['id']}/"
        self.assertEqual(self.client.post(endpoint + "publish/").status_code, 200)
        saved = self.client.patch(endpoint, {"title": "New Heading"}, format="json")
        self.assertEqual(saved.status_code, 200)
        live = APIClient().get("/api/cms/v1/content/resolve/", {
            "site": self.site.domain, "path": "/",
        })
        self.assertEqual(live.status_code, 200, live.data)
        self.assertEqual(live.data["content"]["title"], "Homepage")

    def test_singleton_is_tenant_scoped(self):
        ct = self.create_type()
        stranger_org = Organization.objects.create(name="Stranger", slug="stranger")
        stranger = get_user_model().objects.create_user(username="singleton-stranger")
        Membership.objects.create(organization=stranger_org, user=stranger, role=Membership.Role.OWNER)
        cli = APIClient()
        cli.force_authenticate(stranger)
        response = cli.get(f"/api/cms/v1/content/types/{ct['id']}/singleton-entry/")
        self.assertEqual(response.status_code, 404)
