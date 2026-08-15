from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.seo.models import InternalLinkSuggestion
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class InternalLinkGeneratorTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="owner", password="x")
        self.viewer = User.objects.create_user(username="viewer-links", password="x")
        self.other_owner = User.objects.create_user(username="other-owner", password="x")

        self.org = Organization.objects.create(name="SEO Org", slug="seo-org")
        self.other_org = Organization.objects.create(name="Other Org", slug="other-org")
        self.site = Site.objects.create(organization=self.org, name="Main", domain="main.test")
        self.other_site = Site.objects.create(organization=self.other_org, name="Other", domain="other.test")

        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.viewer, role=Membership.Role.VIEWER)
        Membership.objects.create(organization=self.other_org, user=self.other_owner, role=Membership.Role.OWNER)

        self.content_type = ContentTypeDefinition.objects.create(site=self.site, name="Article", slug="article")
        self.other_content_type = ContentTypeDefinition.objects.create(site=self.other_site, name="Article", slug="article")

        self.source = ContentEntry.objects.create(
            site=self.site,
            content_type=self.content_type,
            title="راهنمای جامع سئو سایت",
            slug="seo-guide",
            path="/seo-guide/",
            status=ContentEntry.Status.PUBLISHED,
            blocks=[{"id": "p-1", "type": "paragraph", "data": {"text": "در این بخش راهنمای سئو تکنیکال را بررسی می‌کنیم."}}],
        )
        self.target = ContentEntry.objects.create(
            site=self.site,
            content_type=self.content_type,
            title="راهنمای سئو تکنیکال",
            slug="technical-seo",
            path="/technical-seo/",
            status=ContentEntry.Status.PUBLISHED,
        )
        self.other_source = ContentEntry.objects.create(
            site=self.other_site,
            content_type=self.other_content_type,
            title="Other source",
            slug="other-source",
            path="/other-source/",
            status=ContentEntry.Status.PUBLISHED,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def test_owner_can_generate_ranked_same_site_suggestion(self):
        response = self.client_for(self.owner).post(
            "/api/cms/v1/seo/internal-links/generate/",
            {"source_entry": str(self.source.id)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["target_path"], self.target.path)
        self.assertGreaterEqual(float(response.data["results"][0]["score"]), 90)
        self.assertTrue(
            InternalLinkSuggestion.objects.filter(
                source_entry=self.source,
                target_entry=self.target,
                status="suggested",
            ).exists()
        )

    def test_generator_skips_target_already_linked_in_blocks(self):
        self.source.blocks = [
            {
                "id": "cta-1",
                "type": "cta",
                "data": {
                    "title": "راهنمای سئو تکنیکال",
                    "text": "مطالعه بیشتر",
                    "href": self.target.path,
                },
            }
        ]
        self.source.save(update_fields=["blocks", "updated_at"])

        response = self.client_for(self.owner).post(
            "/api/cms/v1/seo/internal-links/generate/",
            {"source_entry": str(self.source.id)},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_viewer_cannot_generate_suggestions(self):
        response = self.client_for(self.viewer).post(
            "/api/cms/v1/seo/internal-links/generate/",
            {"source_entry": str(self.source.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_user_cannot_generate_for_another_tenant(self):
        response = self.client_for(self.owner).post(
            "/api/cms/v1/seo/internal-links/generate/",
            {"source_entry": str(self.other_source.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
