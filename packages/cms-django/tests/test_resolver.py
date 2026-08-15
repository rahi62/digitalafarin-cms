from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.sites.models import Organization, Site


class ResolveApiTests(TestCase):
    def setUp(self):
        organization = Organization.objects.create(name="Acme", slug="acme")
        self.site = Site.objects.create(
            organization=organization,
            name="Acme",
            domain="example.test",
        )
        content_type = ContentTypeDefinition.objects.create(
            site=self.site,
            name="Page",
            slug="page",
        )
        ContentEntry.objects.create(
            site=self.site,
            content_type=content_type,
            title="Home",
            slug="home",
            path="/",
            status=ContentEntry.Status.PUBLISHED,
        )

    def test_public_resolver(self):
        response = APIClient().get(
            "/api/cms/v1/content/resolve/",
            {"site": "example.test", "path": "/"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["content"]["title"], "Home")

    def test_missing_site_is_400(self):
        response = APIClient().get("/api/cms/v1/content/resolve/", {"path": "/"})
        self.assertEqual(response.status_code, 400)

from django.contrib.auth import get_user_model
from digitalafarin_cms.apps.sites.models import Membership


class TenantIsolationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user_a = User.objects.create_user(username="a", password="x")
        self.user_b = User.objects.create_user(username="b", password="x")
        self.org_a = Organization.objects.create(name="Org A", slug="org-a")
        self.org_b = Organization.objects.create(name="Org B", slug="org-b")
        self.site_a = Site.objects.create(organization=self.org_a, name="Site A", domain="a.test")
        self.site_b = Site.objects.create(organization=self.org_b, name="Site B", domain="b.test")
        Membership.objects.create(organization=self.org_a, user=self.user_a, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org_b, user=self.user_b, role=Membership.Role.OWNER)

    def test_authenticated_site_list_is_scoped_to_memberships(self):
        client = APIClient()
        client.force_authenticate(self.user_a)
        response = client.get("/api/cms/v1/sites/")
        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data["results"]}
        self.assertIn(str(self.site_a.id), ids)
        self.assertNotIn(str(self.site_b.id), ids)

    def test_cross_tenant_site_create_is_rejected(self):
        client = APIClient()
        client.force_authenticate(self.user_a)
        response = client.post(
            "/api/cms/v1/sites/",
            {"organization": str(self.org_b.id), "name": "Forbidden", "domain": "forbidden.test"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_viewer_can_read_but_cannot_mutate_site(self):
        User = get_user_model()
        viewer = User.objects.create_user(username="viewer", password="x")
        Membership.objects.create(
            organization=self.org_a, user=viewer, role=Membership.Role.VIEWER
        )
        client = APIClient()
        client.force_authenticate(viewer)

        read_response = client.get(f"/api/cms/v1/sites/{self.site_a.id}/")
        self.assertEqual(read_response.status_code, 200)

        write_response = client.patch(
            f"/api/cms/v1/sites/{self.site_a.id}/",
            {"name": "Nope"},
            format="json",
        )
        self.assertEqual(write_response.status_code, 403)

        create_response = client.post(
            "/api/cms/v1/content/types/",
            {"site": str(self.site_a.id), "name": "Forbidden Type", "slug": "forbidden-type"},
            format="json",
        )
        self.assertEqual(create_response.status_code, 403)
