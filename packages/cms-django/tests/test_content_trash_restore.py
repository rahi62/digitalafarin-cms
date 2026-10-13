from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import (
    ContentEntry, ContentTypeDefinition, PublishedEntry,
)
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class ContentTrashRestoreTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Trash Org", slug="trash-org")
        self.site = Site.objects.create(organization=self.org, name="Trash", domain="trash.test")
        User = get_user_model()
        self.owner = User.objects.create_user(username="trash-owner")
        self.writer = User.objects.create_user(username="trash-writer")
        self.viewer = User.objects.create_user(username="trash-viewer")
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.writer, role=Membership.Role.WRITER)
        Membership.objects.create(organization=self.org, user=self.viewer, role=Membership.Role.VIEWER)
        self.kind = ContentTypeDefinition.objects.create(site=self.site, name="Post", slug="post")
        self.owner_client = self.client_for(self.owner)
        self.writer_client = self.client_for(self.writer)
        self.viewer_client = self.client_for(self.viewer)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def create_entry(self, *, path="/story/", title="Story", **values):
        return ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title=title,
            slug=path.strip("/") or "home", path=path, **values,
        )

    def endpoint(self, entry):
        return f"/api/cms/v1/content/entries/{entry.pk}/"

    def test_draft_delete_is_reversible_without_permanent_record_loss(self):
        entry = self.create_entry()
        result = self.owner_client.delete(self.endpoint(entry))
        self.assertEqual(result.status_code, 204, result.data)
        entry.refresh_from_db()
        self.assertIsNotNone(entry.deleted_at)
        self.assertEqual(entry.deleted_by_id, self.owner.pk)
        self.assertEqual(entry.status, ContentEntry.Status.ARCHIVED)
        self.assertEqual(self.owner_client.get(self.endpoint(entry)).status_code, 404)
        self.assertEqual(self.owner_client.get("/api/cms/v1/content/entries/").data["count"], 0)

        trash = self.owner_client.get("/api/cms/v1/content/entries/trashed/")
        self.assertEqual(trash.status_code, 200, trash.data)
        self.assertEqual(trash.data["count"], 1)
        self.assertEqual(trash.data["results"][0]["id"], str(entry.pk))
        self.assertIsNotNone(trash.data["results"][0]["deleted_at"])

        restored = self.owner_client.post(self.endpoint(entry) + "restore/")
        self.assertEqual(restored.status_code, 200, restored.data)
        entry.refresh_from_db()
        self.assertIsNone(entry.deleted_at)
        self.assertIsNone(entry.deleted_by)
        self.assertEqual(entry.status, ContentEntry.Status.DRAFT)
        self.assertEqual(self.owner_client.get(self.endpoint(entry)).status_code, 200)
        self.assertEqual(entry.revisions.order_by("-number").first().note, "Restored from Trash")

    def test_published_content_unpublishes_on_trash_and_restore_only_draft(self):
        entry = self.create_entry()
        self.assertEqual(self.owner_client.post(self.endpoint(entry) + "publish/").status_code, 200)
        public = APIClient()
        url = "/api/cms/v1/content/resolve/"
        self.assertEqual(public.get(url, {"site": self.site.domain, "path": entry.path}).status_code, 200)
        deleted = self.owner_client.post(self.endpoint(entry) + "trash/")
        self.assertEqual(deleted.status_code, 200, deleted.data)
        self.assertTrue(deleted.data["restorable"])
        self.assertFalse(PublishedEntry.objects.filter(entry=entry).exists())
        self.assertEqual(public.get(url, {"site": self.site.domain, "path": entry.path}).status_code, 404)
        restored = self.owner_client.post(self.endpoint(entry) + "restore/")
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(restored.data["status"], "draft")
        self.assertEqual(public.get(url, {"site": self.site.domain, "path": entry.path}).status_code, 404)
        self.assertEqual(self.owner_client.post(self.endpoint(entry) + "publish/").status_code, 200)
        self.assertEqual(public.get(url, {"site": self.site.domain, "path": entry.path}).status_code, 200)

    def test_writer_may_trash_draft_but_not_published(self):
        draft = self.create_entry()
        self.assertEqual(self.writer_client.delete(self.endpoint(draft)).status_code, 204)
        self.assertEqual(self.viewer_client.get("/api/cms/v1/content/entries/trashed/").status_code, 200)
        self.assertEqual(self.viewer_client.post(self.endpoint(draft) + "restore/").status_code, 403)
        entry = self.create_entry(path="/live/", title="Live")
        self.assertEqual(self.owner_client.post(self.endpoint(entry) + "publish/").status_code, 200)
        forbidden = self.writer_client.delete(self.endpoint(entry))
        self.assertEqual(forbidden.status_code, 403)
        entry.refresh_from_db()
        self.assertIsNone(entry.deleted_at)
        self.assertTrue(PublishedEntry.objects.filter(entry=entry).exists())

    def test_soft_deleted_route_and_singleton_slot_stay_reserved(self):
        ct = ContentTypeDefinition.objects.create(
            site=self.site, name="Homepage", slug="home", kind="singleton",
        )
        entry = ContentEntry.objects.create(
            site=self.site, content_type=ct, title="Homepage", slug="homepage", path="/",
        )
        self.assertEqual(self.owner_client.delete(self.endpoint(entry)).status_code, 204)
        collision = self.owner_client.post("/api/cms/v1/content/entries/", {
            "site": str(self.site.pk), "content_type": str(ct.pk), "title": "Duplicate",
            "slug": "other", "path": "/other/",
        }, format="json")
        self.assertEqual(collision.status_code, 400)
        self.assertEqual(self.owner_client.post(self.endpoint(entry) + "restore/").status_code, 200)

        other = self.owner_client.post("/api/cms/v1/content/entries/", {
            "site": str(self.site.pk), "content_type": str(self.kind.pk),
            "title": "URL reuse", "slug": "homepage", "path": "/",
        }, format="json")
        self.assertEqual(other.status_code, 400)

    def test_incoming_relations_block_trash(self):
        target = self.create_entry()
        source_type = ContentTypeDefinition.objects.create(
            site=self.site, name="Tour", slug="tour",
            schema={"fields": [{"key": "place", "type": "relation", "target_content_type": "post"}]},
        )
        source = ContentEntry.objects.create(
            site=self.site, content_type=source_type, title="Trip",
            slug="trip", path="/trip/", custom_fields={"place": str(target.pk)},
        )
        blocked = self.owner_client.delete(self.endpoint(target))
        self.assertEqual(blocked.status_code, 400, blocked.data)
        self.assertIn("referenced_by", blocked.data)
        source.custom_fields = {}
        source.save()
        self.assertEqual(self.owner_client.delete(self.endpoint(target)).status_code, 204)

    def test_trashed_entries_cannot_be_new_relation_targets(self):
        entry = self.create_entry()
        self.assertEqual(self.owner_client.delete(self.endpoint(entry)).status_code, 204)
        ct = ContentTypeDefinition.objects.create(
            site=self.site, name="Linked", slug="linked",
            schema={"fields": [{"key": "target", "type": "relation", "target_content_type": "post"}]},
        )
        result = self.owner_client.post("/api/cms/v1/content/entries/", {
            "site": str(self.site.pk), "content_type": str(ct.pk),
            "title": "Linked", "slug": "linked", "path": "/linked/",
            "custom_fields": {"target": str(entry.pk)},
        }, format="json")
        self.assertEqual(result.status_code, 400, result.data)
        self.assertIn("target", result.data["custom_fields"])

    def test_tenant_isolation_and_fields_are_server_owned(self):
        entry = self.create_entry()
        other_org = Organization.objects.create(name="Other", slug="other-trash")
        other = get_user_model().objects.create_user(username="other-trash")
        Membership.objects.create(organization=other_org, user=other, role=Membership.Role.OWNER)
        other_client = self.client_for(other)
        self.assertEqual(other_client.post(self.endpoint(entry) + "trash/").status_code, 404)
        self.assertEqual(self.owner_client.delete(self.endpoint(entry)).status_code, 204)
        self.assertEqual(other_client.post(self.endpoint(entry) + "restore/").status_code, 404)
        self.assertEqual(other_client.get("/api/cms/v1/content/entries/trashed/").data["count"], 0)
        fake = self.owner_client.post(self.endpoint(entry) + "restore/")
        self.assertEqual(fake.status_code, 200)
        forged = self.owner_client.patch(self.endpoint(entry), {"deleted_at": "2021-01-01T00:00:00Z"}, format="json")
        self.assertEqual(forged.status_code, 200)
        entry.refresh_from_db()
        self.assertIsNone(entry.deleted_at)
