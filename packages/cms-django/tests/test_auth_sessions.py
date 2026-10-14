from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError


class CmsSessionSecurityTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="session-owner", password="test-secret")

    def login(self):
        return APIClient().post("/api/cms/v1/auth/token/", {
            "username": "session-owner", "password": "test-secret",
        }, format="json")

    def test_rotation_blacklists_previous_refresh(self):
        credentials = self.login()
        self.assertEqual(credentials.status_code, 200, credentials.data)
        first = credentials.data["refresh"]
        rotated = APIClient().post("/api/cms/v1/auth/token/refresh/", {
            "refresh": first,
        }, format="json")
        self.assertEqual(rotated.status_code, 200, rotated.data)
        self.assertIn("refresh", rotated.data)
        self.assertNotEqual(rotated.data["refresh"], first)
        reused = APIClient().post("/api/cms/v1/auth/token/refresh/", {
            "refresh": first,
        }, format="json")
        self.assertEqual(reused.status_code, 401, reused.data)

    def test_logout_revokes_refresh_and_rejects_token_reuse(self):
        credentials = self.login()
        access, refresh = credentials.data["access"], credentials.data["refresh"]
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + access)
        result = client.post("/api/cms/v1/auth/logout/", {"refresh": refresh}, format="json")
        self.assertEqual(result.status_code, 204, result.data)
        cannot_refresh = APIClient().post("/api/cms/v1/auth/token/refresh/", {
            "refresh": refresh,
        }, format="json")
        self.assertEqual(cannot_refresh.status_code, 401, cannot_refresh.data)

    def test_logout_prevents_cross_account_revocation(self):
        foreign = get_user_model().objects.create_user(username="other-session", password="another-secret")
        primary = self.login().data
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + primary["access"])
        foreign_refresh = str(RefreshToken.for_user(foreign))
        denied = client.post("/api/cms/v1/auth/logout/", {
            "refresh": foreign_refresh,
        }, format="json")
        self.assertEqual(denied.status_code, 400, denied.data)
        still_works = APIClient().post("/api/cms/v1/auth/token/refresh/", {
            "refresh": foreign_refresh,
        }, format="json")
        self.assertEqual(still_works.status_code, 200, still_works.data)

    def test_anonymous_logout_and_missing_refresh_rejected(self):
        anonymous = APIClient().post("/api/cms/v1/auth/logout/", {
            "refresh": "not-a-token",
        }, format="json")
        self.assertIn(anonymous.status_code, [401, 403])
        credentials = self.login().data
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + credentials["access"])
        missing = client.post("/api/cms/v1/auth/logout/", {}, format="json")
        self.assertEqual(missing.status_code, 400, missing.data)
        invalid = client.post("/api/cms/v1/auth/logout/", {
            "refresh": "not-a-token",
        }, format="json")
        self.assertEqual(invalid.status_code, 400, invalid.data)
