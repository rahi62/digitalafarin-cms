from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


class TokenSessionSecurityTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="secure-session-user", password="secure-session-password"
        )
        self.client = APIClient()
        self.base = "/api/cms/v1/auth/token/"

    def test_refresh_rotation_blacklists_old_refresh_and_logout_blacklists_current_refresh(self):
        login = self.client.post(self.base, {
            "username": "secure-session-user",
            "password": "secure-session-password",
        }, format="json")
        self.assertEqual(login.status_code, 200, login.data)
        self.assertIn("access", login.data)
        self.assertIn("refresh", login.data)
        original = login.data["refresh"]
        renewed = self.client.post(self.base + "refresh/", {
            "refresh": original,
        }, format="json")
        self.assertEqual(renewed.status_code, 200, renewed.data)
        self.assertNotEqual(renewed.data["refresh"], original)
        reused = self.client.post(self.base + "refresh/", {
            "refresh": original,
        }, format="json")
        self.assertEqual(reused.status_code, 401, reused.data)

        revoked = self.client.post(self.base + "blacklist/", {
            "refresh": renewed.data["refresh"],
        }, format="json")
        self.assertEqual(revoked.status_code, 200, revoked.data)
        after_logout = self.client.post(self.base + "refresh/", {
            "refresh": renewed.data["refresh"],
        }, format="json")
        self.assertEqual(after_logout.status_code, 401, after_logout.data)

    def test_bad_password_is_rejected(self):
        response = self.client.post(self.base, {
            "username": "secure-session-user",
            "password": "wrong",
        }, format="json")
        self.assertEqual(response.status_code, 401, response.data)
