from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class TaxonomyAndMenuTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="menu-owner", password="x")
        self.viewer = User.objects.create_user(username="menu-viewer", password="x")
        self.org = Organization.objects.create(name="Menu Org", slug="menu-org")
        self.site = Site.objects.create(organization=self.org, name="Menu Site", domain="menu.test")
        Membership.objects.create(organization=self.org, user=self.owner, role=Membership.Role.OWNER)
        Membership.objects.create(organization=self.org, user=self.viewer, role=Membership.Role.VIEWER)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def create_menu(self, name="Main", key="main"):
        response = self.client.post(
            "/api/cms/v1/content/menus/",
            {"site": str(self.site.id), "name": name, "key": key},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_public_menu_resolver_returns_nested_items(self):
        menu = self.create_menu()
        parent = self.client.post(
            "/api/cms/v1/content/menu-items/",
            {
                "menu": menu["id"],
                "label": "Services",
                "url": "/services/",
                "parent": None,
                "sort_order": 1,
                "is_external": False,
            },
            format="json",
        )
        self.assertEqual(parent.status_code, 201, parent.data)
        child = self.client.post(
            "/api/cms/v1/content/menu-items/",
            {
                "menu": menu["id"],
                "label": "SEO",
                "url": "/services/seo/",
                "parent": parent.data["id"],
                "sort_order": 1,
                "is_external": False,
            },
            format="json",
        )
        self.assertEqual(child.status_code, 201, child.data)

        response = APIClient().get(
            "/api/cms/v1/content/menu-resolve/",
            {"site": "menu.test", "key": "main"},
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["key"], "main")
        self.assertEqual(response.data["items"][0]["label"], "Services")
        self.assertEqual(response.data["items"][0]["children"][0]["label"], "SEO")

    def test_parent_must_belong_to_same_menu(self):
        menu_a = self.create_menu("A", "a")
        menu_b = self.create_menu("B", "b")
        parent = self.client.post(
            "/api/cms/v1/content/menu-items/",
            {"menu": menu_a["id"], "label": "Parent", "url": "/parent/", "sort_order": 0},
            format="json",
        )
        self.assertEqual(parent.status_code, 201)
        response = self.client.post(
            "/api/cms/v1/content/menu-items/",
            {
                "menu": menu_b["id"],
                "label": "Invalid child",
                "url": "/invalid/",
                "parent": parent.data["id"],
                "sort_order": 0,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("parent", response.data)

    def test_viewer_cannot_create_menu_item(self):
        menu = self.create_menu()
        client = APIClient()
        client.force_authenticate(self.viewer)
        response = client.post(
            "/api/cms/v1/content/menu-items/",
            {"menu": menu["id"], "label": "Nope", "url": "/nope/", "sort_order": 0},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_category_parent_must_belong_to_same_site(self):
        other_org = Organization.objects.create(name="Other", slug="menu-other")
        other_site = Site.objects.create(organization=other_org, name="Other Site", domain="other-menu.test")
        Membership.objects.create(organization=other_org, user=self.owner, role=Membership.Role.OWNER)
        parent = self.client.post(
            "/api/cms/v1/content/categories/",
            {"site": str(other_site.id), "name": "Other Parent", "slug": "other-parent"},
            format="json",
        )
        self.assertEqual(parent.status_code, 201)
        response = self.client.post(
            "/api/cms/v1/content/categories/",
            {
                "site": str(self.site.id),
                "name": "Invalid Child",
                "slug": "invalid-child",
                "parent": parent.data["id"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("parent", response.data)

    def test_public_menu_resolver_requires_site_and_key(self):
        response = APIClient().get("/api/cms/v1/content/menu-resolve/")
        self.assertEqual(response.status_code, 400)
