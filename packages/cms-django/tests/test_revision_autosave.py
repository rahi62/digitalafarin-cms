from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class AutosaveRevisionTests(TestCase):
    def setUp(self):
        organization = Organization.objects.create(name="Revision Org", slug="revision-org")
        site = Site.objects.create(organization=organization, name="Revision Site", domain="revision.test")
        author = get_user_model().objects.create_user(username="revisions-owner", password="x")
        Membership.objects.create(organization=organization, user=author, role=Membership.Role.OWNER)
        kind = ContentTypeDefinition.objects.create(site=site, name="Post", slug="post")
        self.client = APIClient()
        self.client.force_authenticate(author)
        created = self.client.post("/api/cms/v1/content/entries/", {
            "site": str(site.pk), "content_type": str(kind.pk),
            "title": "Original", "slug": "original", "path": "/original/", "status": "draft",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.entry = ContentEntry.objects.get(pk=created.data["id"])

    def patch(self, title, autosave=False):
        return self.client.patch(
            f"/api/cms/v1/content/entries/{self.entry.pk}/",
            {"title": title}, format="json",
            **({"HTTP_X_CMS_AUTOSAVE": "1"} if autosave else {}),
        )

    def test_autosave_revision_is_coalesced_but_manual_save_is_immutable(self):
        self.assertEqual(self.entry.revisions.count(), 1)
        self.assertEqual(self.patch("Auto 1", autosave=True).status_code, 200)
        self.assertEqual(self.patch("Auto 2", autosave=True).status_code, 200)
        revisions = list(self.entry.revisions.order_by("number"))
        self.assertEqual(len(revisions), 2)
        self.assertEqual(revisions[1].number, 2)
        self.assertEqual(revisions[1].note, "Autosaved")
        self.assertEqual(revisions[1].snapshot["title"], "Auto 2")
        self.assertEqual(revisions[0].snapshot["title"], "Original")
        self.assertEqual(self.patch("Manual").status_code, 200)
        self.assertEqual(self.patch("Auto 3", autosave=True).status_code, 200)
        self.assertEqual(self.entry.revisions.count(), 4)
        self.assertEqual(self.entry.revisions.get(number=3).snapshot["title"], "Manual")
        self.assertEqual(self.entry.revisions.get(number=4).snapshot["title"], "Auto 3")
