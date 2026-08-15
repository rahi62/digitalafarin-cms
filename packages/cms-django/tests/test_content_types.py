from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class DynamicContentTypeTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="owner", password="x")
        self.org = Organization.objects.create(name="Builder Org", slug="builder-org")
        self.site = Site.objects.create(
            organization=self.org,
            name="Builder Site",
            domain="builder.test",
        )
        Membership.objects.create(
            organization=self.org,
            user=self.user,
            role=Membership.Role.OWNER,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def create_type(self):
        response = self.client.post(
            "/api/cms/v1/content/types/",
            {
                "site": str(self.site.id),
                "name": "Tour",
                "slug": "tour",
                "icon": "T",
                "is_public": True,
                "schema": {
                    "fields": [
                        {
                            "key": "destination",
                            "label": "Destination",
                            "type": "text",
                            "required": True,
                        },
                        {
                            "key": "price",
                            "label": "Price",
                            "type": "number",
                        },
                        {
                            "key": "hero_image",
                            "label": "Hero image",
                            "type": "media",
                        },
                    ]
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_content_type_schema_is_persisted(self):
        data = self.create_type()
        self.assertEqual(data["schema"]["fields"][0]["key"], "destination")
        self.assertTrue(data["schema"]["fields"][0]["required"])

    def test_duplicate_field_keys_are_rejected(self):
        response = self.client.post(
            "/api/cms/v1/content/types/",
            {
                "site": str(self.site.id),
                "name": "Broken",
                "slug": "broken",
                "schema": {
                    "fields": [
                        {"key": "title_extra", "type": "text"},
                        {"key": "title_extra", "type": "textarea"},
                    ]
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("schema", response.data)

    def test_invalid_field_key_is_rejected(self):
        response = self.client.post(
            "/api/cms/v1/content/types/",
            {
                "site": str(self.site.id),
                "name": "Broken Key",
                "slug": "broken-key",
                "schema": {"fields": [{"key": "bad-key", "type": "text"}]},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_required_custom_field_is_enforced_on_entry(self):
        content_type = self.create_type()
        response = self.client.post(
            "/api/cms/v1/content/entries/",
            {
                "site": str(self.site.id),
                "content_type": content_type["id"],
                "title": "Tehran Tour",
                "slug": "tehran-tour",
                "path": "/tours/tehran-tour/",
                "status": "draft",
                "custom_fields": {"price": 100},
                "blocks": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("custom_fields", response.data)

    def test_entry_accepts_dynamic_custom_fields(self):
        content_type = self.create_type()
        response = self.client.post(
            "/api/cms/v1/content/entries/",
            {
                "site": str(self.site.id),
                "content_type": content_type["id"],
                "title": "Tehran Tour",
                "slug": "tehran-tour",
                "path": "/tours/tehran-tour/",
                "status": "draft",
                "custom_fields": {
                    "destination": "Tehran",
                    "price": 100,
                    "hero_image": "https://example.test/media/hero.jpg",
                },
                "blocks": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["custom_fields"]["destination"], "Tehran")
        self.assertEqual(response.data["custom_fields"]["price"], 100)

    def test_viewer_cannot_create_content_type(self):
        User = get_user_model()
        viewer = User.objects.create_user(username="viewer-builder", password="x")
        Membership.objects.create(
            organization=self.org,
            user=viewer,
            role=Membership.Role.VIEWER,
        )
        client = APIClient()
        client.force_authenticate(viewer)
        response = client.post(
            "/api/cms/v1/content/types/",
            {
                "site": str(self.site.id),
                "name": "Forbidden",
                "slug": "forbidden",
                "schema": {"fields": []},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)
