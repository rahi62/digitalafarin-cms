from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class RelationDeletionProtectionTests(TestCase):
    def setUp(self):
        org = Organization.objects.create(name="Relations", slug="safe-relations")
        self.site = Site.objects.create(organization=org, name="Content Site", domain="relations.test")
        self.user = get_user_model().objects.create_user(username="relations-owner")
        Membership.objects.create(organization=org, user=self.user, role=Membership.Role.OWNER)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.target_type = ContentTypeDefinition.objects.create(
            site=self.site, name="Destination", slug="destination")
        self.source_type = ContentTypeDefinition.objects.create(
            site=self.site, name="Tour", slug="tour", schema={"fields": [
                {"key": "days", "type": "repeater", "fields": [
                    {"key": "context", "type": "group", "fields": [
                        {"key": "destination", "type": "relation", "target_content_type": "destination"},
                    ]}
                ]}
            ]})
        self.target = ContentEntry.objects.create(
            site=self.site, content_type=self.target_type, title="Paris", slug="paris", path="/paris/",
        )
        self.source = ContentEntry.objects.create(
            site=self.site, content_type=self.source_type, title="Tour", slug="tour", path="/tour/",
            custom_fields={"days": [{"context": {"destination": str(self.target.pk)}}]},
        )

    def delete_target(self):
        return self.client.delete(f"/api/cms/v1/content/entries/{self.target.pk}/")

    def test_nested_relation_blocks_hard_delete(self):
        response = self.delete_target()
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("referenced_by", response.data)
        self.assertTrue(ContentEntry.objects.filter(pk=self.target.pk).exists())
        self.source.custom_fields = {"days": []}
        self.source.save()
        response = self.delete_target()
        self.assertEqual(response.status_code, 204, response.data)

    def test_published_snapshot_relation_blocks_delete_after_editor_unlinks(self):
        self.assertEqual(self.client.post(
            f"/api/cms/v1/content/entries/{self.source.pk}/publish/"
        ).status_code, 200)
        self.source.custom_fields = {"days": []}
        self.source.save()
        response = self.delete_target()
        self.assertEqual(response.status_code, 400, response.data)
        self.assertTrue(any(
            record["version"] == "published" for record in response.data["referenced_by"]
        ))
        self.assertEqual(self.client.post(
            f"/api/cms/v1/content/entries/{self.source.pk}/publish/"
        ).status_code, 200)
        self.assertEqual(self.delete_target().status_code, 204)

    def test_published_target_cannot_be_hard_deleted(self):
        self.assertEqual(self.client.post(
            f"/api/cms/v1/content/entries/{self.target.pk}/publish/"
        ).status_code, 200)
        self.source.custom_fields = {"days": []}
        self.source.save()
        # DELETE is now recoverable Trash; live publication is withdrawn atomically.
        trashed = self.delete_target()
        self.assertEqual(trashed.status_code, 204, trashed.data)
        self.assertTrue(ContentEntry.objects.filter(pk=self.target.pk, deleted_at__isnull=False).exists())

    def test_target_type_slug_change_and_delete_blocked(self):
        res = self.client.patch(f"/api/cms/v1/content/types/{self.target_type.pk}/", {
            "slug": "destination-new",
        }, format="json")
        self.assertEqual(res.status_code, 400, res.data)
        self.assertIn("slug", res.data)
        self.source.delete()
        self.target.delete()
        remove = self.client.delete(f"/api/cms/v1/content/types/{self.target_type.pk}/")
        self.assertEqual(remove.status_code, 400, remove.data)
        self.assertIn("referenced_by", remove.data)

    def test_other_tenant_cannot_delete_target(self):
        outsider_org = Organization.objects.create(name="Other", slug="relations-other")
        outsider = get_user_model().objects.create_user(username="relations-outsider")
        Membership.objects.create(organization=outsider_org, user=outsider, role=Membership.Role.OWNER)
        cli = APIClient()
        cli.force_authenticate(outsider)
        self.assertEqual(cli.delete(f"/api/cms/v1/content/entries/{self.target.pk}/").status_code, 404)
