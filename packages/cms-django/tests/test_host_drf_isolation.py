"""CMS endpoints must not depend on the host project's global REST_FRAMEWORK."""
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from digitalafarin_cms.apps.sites.models import Membership, Organization, Site

HOST_DRF = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.LimitOffsetPagination",
    "PAGE_SIZE": 1,
    "DEFAULT_FILTER_BACKENDS": [],
}


@override_settings(REST_FRAMEWORK=HOST_DRF)
class HostDrfIsolationTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="iso-user", password="secure-test-password")
        self.org = Organization.objects.create(name="Iso", slug="iso")
        Membership.objects.create(organization=self.org, user=self.user, role=Membership.Role.OWNER)
        for i in range(3):
            Site.objects.create(organization=self.org, name=f"S{i}", domain=f"s{i}.iso.example")

    def bearer_client(self):
        login = APIClient().post(
            "/api/cms/v1/auth/token/",
            {"username": "iso-user", "password": "secure-test-password"}, format="json",
        )
        self.assertEqual(login.status_code, 200, login.data)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + login.data["access"])
        return client

    def test_admin_list_uses_cms_jwt_auth_and_page_number_shape(self):
        response = self.bearer_client().get("/api/cms/v1/sites/")
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 3)  # CMS page size, not host PAGE_SIZE=1
        self.assertIn("next", response.data)
        self.assertNotIn("limit", response.data)

    def test_page_param_is_honoured_not_limit_offset(self):
        with override_settings(DIGITALAFARIN_CMS_PAGE_SIZE=2):
            response = self.bearer_client().get("/api/cms/v1/sites/", {"page": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_public_endpoints_ignore_host_session_authentication(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.user)  # host Django session cookie present
        response = client.get("/api/cms/v1/site-context/", {"site": "s0.iso.example"})
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        response = client.get("/api/cms/v1/content/sitemap/", {"site": "s0.iso.example"})
        self.assertNotIn(response.status_code, (401, 403))

    def test_protected_endpoint_rejects_host_session_without_cms_jwt(self):
        client = APIClient()
        client.force_login(self.user)
        response = client.get("/api/cms/v1/sites/")
        self.assertEqual(response.status_code, 401)
