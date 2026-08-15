from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class SiteSettingsTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="settings-owner", password="x")
        self.seo = User.objects.create_user(username="settings-seo", password="x")
        self.writer = User.objects.create_user(username="settings-writer", password="x")
        self.org = Organization.objects.create(name="Settings Org", slug="settings-org")
        self.site = Site.objects.create(
            organization=self.org,
            name="Settings Site",
            domain="settings.example",
            settings={
                "secret_api_key": "must-never-be-public",
                "plugin_x": {"token": "private-plugin-token"},
                "frontend_url": "https://www.settings.example",
                "audit_base_url": "https://www.settings.example",
                "seo_defaults": {
                    "site_name": "Settings Brand",
                    "title_template": "{{title}} | {{site_name}}",
                    "default_description": "Default site description",
                    "default_og_image": "https://www.settings.example/og.jpg",
                    "twitter_card": "summary_large_image",
                    "robots_index": True,
                    "robots_follow": True,
                    "unexpected_secret": "not-public",
                },
                "organization_schema": {
                    "enabled": True,
                    "type": "Organization",
                    "name": "Settings Brand",
                    "legal_name": "Settings Legal LLC",
                    "url": "https://www.settings.example",
                    "logo": "https://www.settings.example/logo.png",
                    "same_as": ["https://social.example/settings"],
                    "email": "info@settings.example",
                    "telephone": "+1-555-0100",
                    "private_note": "not-public",
                },
            },
        )
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.seo, role=Membership.Role.SEO)
        Membership.objects.create(organization=self.org, user=self.writer, role=Membership.Role.WRITER)

    def auth_client(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_public_context_exposes_only_whitelisted_seo_data(self):
        response = APIClient().get("/api/cms/v1/site-context/", {"site": "settings.example"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["name"], "Settings Site")
        self.assertEqual(response.data["seo_defaults"]["site_name"], "Settings Brand")
        self.assertEqual(response.data["seo_defaults"]["title_template"], "{{title}} | {{site_name}}")
        self.assertNotIn("unexpected_secret", response.data["seo_defaults"])
        self.assertNotIn("secret_api_key", response.data)
        self.assertNotIn("plugin_x", response.data)
        self.assertNotIn("frontend_url", response.data)
        self.assertNotIn("audit_base_url", response.data)

        schema = response.data["organization_schema"]
        self.assertEqual(schema["@context"], "https://schema.org")
        self.assertEqual(schema["@type"], "Organization")
        self.assertEqual(schema["legalName"], "Settings Legal LLC")
        self.assertEqual(schema["sameAs"], ["https://social.example/settings"])
        self.assertNotIn("private_note", schema)

    def test_seo_manager_can_patch_cms_settings_without_overwriting_extension_keys(self):
        response = self.auth_client(self.seo).patch(
            f"/api/cms/v1/sites/{self.site.id}/cms-settings/",
            {
                "settings": {
                    "seo_defaults": {
                        "site_name": "New Brand",
                        "title_template": "{{title}} — {{site_name}}",
                        "default_description": "Updated default",
                        "default_og_image": "",
                        "twitter_card": "summary",
                        "robots_index": True,
                        "robots_follow": False,
                    }
                }
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.site.refresh_from_db()
        self.assertEqual(self.site.settings["seo_defaults"]["site_name"], "New Brand")
        self.assertEqual(self.site.settings["secret_api_key"], "must-never-be-public")
        self.assertEqual(self.site.settings["plugin_x"]["token"], "private-plugin-token")
        self.assertEqual(self.site.settings["frontend_url"], "https://www.settings.example")

    def test_writer_cannot_patch_cms_settings_or_site_identity(self):
        client = self.auth_client(self.writer)
        settings_response = client.patch(
            f"/api/cms/v1/sites/{self.site.id}/cms-settings/",
            {"settings": {"seo_defaults": {"site_name": "Forbidden", "title_template": "{{title}}"}}},
            format="json",
        )
        self.assertEqual(settings_response.status_code, 403)

        site_response = client.patch(
            f"/api/cms/v1/sites/{self.site.id}/",
            {"name": "Forbidden Site Name"},
            format="json",
        )
        self.assertEqual(site_response.status_code, 403)

    def test_seo_manager_cannot_change_site_identity(self):
        response = self.auth_client(self.seo).patch(
            f"/api/cms/v1/sites/{self.site.id}/",
            {"domain": "hijacked.example"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_owner_can_change_site_identity(self):
        response = self.auth_client(self.owner).patch(
            f"/api/cms/v1/sites/{self.site.id}/",
            {"name": "Owner Updated Site"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["name"], "Owner Updated Site")

    def test_title_template_requires_title_placeholder(self):
        response = self.auth_client(self.owner).patch(
            f"/api/cms/v1/sites/{self.site.id}/cms-settings/",
            {
                "settings": {
                    "seo_defaults": {
                        "site_name": "Brand",
                        "title_template": "Brand only",
                    }
                }
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_invalid_embedded_credentials_url_is_rejected(self):
        response = self.auth_client(self.owner).patch(
            f"/api/cms/v1/sites/{self.site.id}/cms-settings/",
            {"settings": {"frontend_url": "https://user:password@example.com"}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_inactive_site_has_no_public_context(self):
        self.site.is_active = False
        self.site.save(update_fields=["is_active"])
        response = APIClient().get("/api/cms/v1/site-context/", {"site": "settings.example"})
        self.assertEqual(response.status_code, 404)
