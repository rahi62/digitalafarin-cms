from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class SignedPreviewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="preview-owner", password="x")
        self.organization = Organization.objects.create(name="Preview Org", slug="preview-org")
        self.site = Site.objects.create(
            organization=self.organization,
            name="Preview Site",
            domain="preview.test",
            settings={"frontend_url": "http://localhost:3000"},
        )
        Membership.objects.create(organization=self.organization, user=self.user, role=Membership.Role.OWNER)
        content_type = ContentTypeDefinition.objects.create(site=self.site, name="Page", slug="page")
        self.entry = ContentEntry.objects.create(
            site=self.site,
            content_type=content_type,
            title="Draft page",
            slug="draft-page",
            path="/draft-page/",
            status=ContentEntry.Status.DRAFT,
            blocks=[{"id": "p1", "type": "paragraph", "data": {"text": "Unpublished content"}}],
        )

    def authenticated_client(self):
        client = APIClient()
        client.force_authenticate(self.user)
        return client

    def test_draft_is_not_public_without_preview_token(self):
        response = APIClient().get(
            "/api/cms/v1/content/resolve/",
            {"site": self.site.domain, "path": self.entry.path},
        )
        self.assertEqual(response.status_code, 404)

    def test_owner_can_create_token_and_resolve_draft(self):
        token_response = self.authenticated_client().post(
            f"/api/cms/v1/content/entries/{self.entry.id}/preview/",
            {},
            format="json",
        )
        self.assertEqual(token_response.status_code, 200)
        self.assertIn("cms_preview=", token_response.data["frontend_url"])
        self.assertEqual(token_response.data["expires_in"], 900)

        response = APIClient().get(
            "/api/cms/v1/content/resolve/",
            {
                "site": self.site.domain,
                "path": self.entry.path,
                "preview": token_response.data["token"],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["preview"])
        self.assertEqual(response.data["content"]["title"], "Draft page")

    def test_invalid_preview_token_is_rejected(self):
        response = APIClient().get(
            "/api/cms/v1/content/resolve/",
            {"site": self.site.domain, "path": self.entry.path, "preview": "not-a-valid-token"},
        )
        self.assertEqual(response.status_code, 403)
