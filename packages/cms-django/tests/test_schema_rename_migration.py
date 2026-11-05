from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentSchemaMigration, ContentTypeDefinition
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class SchemaRenameMigrationTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Schema Lab", slug="schema-lab")
        self.site = Site.objects.create(organization=self.org, name="Lab", domain="schema-lab.test")
        User = get_user_model()
        self.owner = User.objects.create_user(username="schema-owner")
        self.writer = User.objects.create_user(username="schema-writer")
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.writer, role=Membership.Role.WRITER)
        self.client = self.auth(self.owner)
        self.writer_client = self.auth(self.writer)
        self.kind = ContentTypeDefinition.objects.create(site=self.site, name="Tour", slug="tour", schema={
            "fields": [{"key": "old_name", "type": "text"},
                       {"key": "price", "type": "number"}]
        })
        self.entry = ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title="Entry One", slug="one", path="/one/",
            custom_fields={"old_name": "original", "price": 100},
        )
        self.blank = ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title="Entry Two", slug="two", path="/two/",
            custom_fields={"price": 200},
        )

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def endpoint(self):
        return f"/api/cms/v1/content/types/{self.kind.pk}/schema-rename/"

    def preview(self, client=None, source="old_name", destination="new_name"):
        return (client or self.client).post(self.endpoint(), {
            "mode": "preview", "source_key": source, "destination_key": destination,
        }, format="json")

    def execute(self, preview, client=None, **override):
        payload = {
            "mode": "execute", "source_key": "old_name", "destination_key": "new_name",
            "preview_token": preview.data.get("preview_token"), "confirm": True,
        }
        payload.update(override)
        return (client or self.client).post(self.endpoint(), payload, format="json")

    def test_preview_is_read_only_and_execute_writes_audited_revisions(self):
        before = self.kind.schema
        report = self.preview()
        self.assertEqual(report.status_code, 200, report.data)
        self.assertTrue(report.data["can_execute"])
        self.assertEqual(report.data["total_entries"], 2)
        self.assertEqual(report.data["changed_entries"], 1)
        self.entry.refresh_from_db()
        self.kind.refresh_from_db()
        self.assertEqual(self.entry.custom_fields["old_name"], "original")
        self.assertEqual(self.kind.schema, before)

        applied = self.execute(report)
        self.assertEqual(applied.status_code, 200, applied.data)
        self.assertEqual(applied.data["changed_entries"], 1)
        self.kind.refresh_from_db()
        self.entry.refresh_from_db()
        self.blank.refresh_from_db()
        self.assertEqual([x["key"] for x in self.kind.schema["fields"]], ["new_name", "price"])
        self.assertEqual(self.entry.custom_fields, {"new_name": "original", "price": 100})
        self.assertEqual(self.blank.custom_fields, {"price": 200})
        audit = ContentSchemaMigration.objects.get(pk=applied.data["migration_id"])
        self.assertEqual(audit.before_schema, before)
        self.assertEqual(audit.executed_by_id, self.owner.pk)
        self.assertEqual(self.entry.revisions.first().snapshot["custom_fields"]["new_name"], "original")

    def test_stale_preview_fails_without_any_partial_change(self):
        report = self.preview()
        self.entry.custom_fields["old_name"] = "changed in another tab"
        self.entry.save(update_fields=["custom_fields", "updated_at"])
        result = self.execute(report)
        self.assertEqual(result.status_code, 400, result.data)
        self.kind.refresh_from_db()
        self.entry.refresh_from_db()
        self.assertEqual(self.kind.schema["fields"][0]["key"], "old_name")
        self.assertEqual(self.entry.custom_fields["old_name"], "changed in another tab")
        self.assertFalse(ContentSchemaMigration.objects.exists())

    def test_collision_blocks_preview_and_execute(self):
        self.blank.custom_fields = {"new_name": "unrelated data", "price": 100}
        self.blank.save()
        blocked = self.preview()
        self.assertEqual(blocked.status_code, 200, blocked.data)
        self.assertFalse(blocked.data["can_execute"])
        self.assertIsNone(blocked.data["preview_token"])
        self.assertTrue(blocked.data["issues"])
        result = self.execute(blocked)
        self.assertEqual(result.status_code, 400)
        self.assertFalse(ContentSchemaMigration.objects.exists())

    def test_published_entries_block_schema_migration(self):
        self.assertEqual(self.client.post(
            f"/api/cms/v1/content/entries/{self.entry.pk}/publish/"
        ).status_code, 200)
        report = self.preview()
        self.assertEqual(report.status_code, 200, report.data)
        self.assertFalse(report.data["can_execute"])
        self.assertEqual(report.data["live_entries"], 1)
        self.assertFalse(ContentSchemaMigration.objects.exists())

    def test_writer_and_other_tenant_cannot_run_schema_migrations(self):
        denied = self.preview(self.writer_client)
        self.assertEqual(denied.status_code, 403)
        outsider_org = Organization.objects.create(name="Else", slug="schema-else")
        stranger = get_user_model().objects.create_user(username="schema-stranger")
        Membership.objects.create(organization=outsider_org, user=stranger, role=Membership.Role.OWNER)
        hidden = self.preview(self.auth(stranger))
        self.assertEqual(hidden.status_code, 404)

    def test_invalid_keys_and_missing_explicit_confirmation_rejected(self):
        for source, target in [("old_name", "old_name"), ("old_name", "bad key"), ("missing", "new_name")]:
            bad = self.preview(source=source, destination=target)
            self.assertEqual(bad.status_code, 400, bad.data)
        report = self.preview()
        self.assertEqual(self.execute(report, confirm=False).status_code, 400)
        self.assertEqual(self.execute(report, preview_token="bad").status_code, 400)
        self.assertFalse(ContentSchemaMigration.objects.exists())
