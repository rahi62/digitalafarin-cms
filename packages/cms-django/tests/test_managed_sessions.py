from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from digitalafarin_cms.apps.sites.models import CmsUserSession


class ManagedCmsSessionsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="managed-session-user", password="secure-test-password",
        )
        self.other = get_user_model().objects.create_user(
            username="other-managed-user", password="secure-test-password",
        )
        self.base = "/api/cms/v1/"

    def login(self, username="managed-session-user"):
        return APIClient().post(
            self.base + "auth/token/",
            {"username": username, "password": "secure-test-password"}, format="json",
            HTTP_USER_AGENT="Browser-test / Windows",
        )

    def client(self, access):
        result = APIClient()
        result.credentials(HTTP_AUTHORIZATION="Bearer " + access)
        return result

    def test_two_sessions_have_distinct_ids_and_public_access_is_denied_after_revocation(self):
        a = self.login()
        b = self.login()
        self.assertEqual(a.status_code, 200, a.data)
        self.assertEqual(b.status_code, 200, b.data)
        sid_a = RefreshToken(a.data["refresh"])["cms_sid"]
        sid_b = RefreshToken(b.data["refresh"])["cms_sid"]
        self.assertNotEqual(sid_a, sid_b)
        viewer_a, viewer_b = self.client(a.data["access"]), self.client(b.data["access"])
        inventory = viewer_a.get(self.base + "auth/sessions/")
        self.assertEqual(inventory.status_code, 200, inventory.data)
        self.assertEqual(inventory.data["current_session_id"], sid_a)
        self.assertEqual(len(inventory.data["results"]), 2)
        self.assertTrue(any(row["current"] and row["device"].startswith("Browser-test") for row in inventory.data["results"]))
        self.assertEqual(viewer_a.get(self.base + "sites/").status_code, 200)

        revoked = viewer_b.post(self.base + f"auth/sessions/{sid_a}/revoke/", {}, format="json")
        self.assertEqual(revoked.status_code, 200, revoked.data)
        self.assertFalse(revoked.data["current_revoked"])
        self.assertEqual(viewer_a.get(self.base + "sites/").status_code, 401)
        self.assertEqual(APIClient().post(self.base + "auth/token/refresh/",
            {"refresh": a.data["refresh"]}, format="json").status_code, 401)
        self.assertEqual(viewer_b.get(self.base + "sites/").status_code, 200)

    def test_revoke_others_then_revoke_all_invalidates_current_access_immediately(self):
        a, b, c = self.login().data, self.login().data, self.login().data
        viewer = self.client(a["access"])
        count = viewer.post(self.base + "auth/sessions/revoke-others/", {}, format="json")
        self.assertEqual(count.status_code, 200, count.data)
        self.assertEqual(count.data["revoked_count"], 2)
        self.assertEqual(viewer.get(self.base + "sites/").status_code, 200)
        self.assertEqual(self.client(b["access"]).get(self.base + "sites/").status_code, 401)
        self.assertEqual(self.client(c["access"]).get(self.base + "sites/").status_code, 401)
        no_confirm = viewer.post(self.base + "auth/sessions/revoke-all/", {}, format="json")
        self.assertEqual(no_confirm.status_code, 400)
        revoked = viewer.post(self.base + "auth/sessions/revoke-all/", {"confirm": True}, format="json")
        self.assertEqual(revoked.status_code, 200)
        self.assertTrue(revoked.data["current_revoked"])
        self.assertEqual(viewer.get(self.base + "sites/").status_code, 401)

    def test_cannot_revoke_other_users_session(self):
        mine = self.login().data
        foreign = self.login("other-managed-user").data
        foreign_id = RefreshToken(foreign["refresh"])["cms_sid"]
        mine_client = self.client(mine["access"])
        denied = mine_client.post(self.base + f"auth/sessions/{foreign_id}/revoke/", {}, format="json")
        self.assertEqual(denied.status_code, 404)
        self.assertEqual(self.client(foreign["access"]).get(self.base + "sites/").status_code, 200)
        anonymous = APIClient().get(self.base + "auth/sessions/")
        self.assertIn(anonymous.status_code, (401, 403))

    def test_refresh_preserves_sid_and_logout_revokes_access(self):
        original = self.login().data
        session_id = RefreshToken(original["refresh"])["cms_sid"]
        result = APIClient().post(self.base + "auth/token/refresh/",
                                  {"refresh": original["refresh"]}, format="json")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(AccessToken(result.data["access"])["cms_sid"], session_id)
        self.assertEqual(RefreshToken(result.data["refresh"])["cms_sid"], session_id)
        client = self.client(result.data["access"])
        self.assertEqual(client.post(self.base + "auth/logout/",
            {"refresh": result.data["refresh"]}, format="json").status_code, 204)
        self.assertEqual(client.get(self.base + "sites/").status_code, 401)
        self.assertIsNotNone(CmsUserSession.objects.get(pk=session_id).revoked_at)

    def test_logout_rejects_different_session_refresh_of_same_user(self):
        first, second = self.login().data, self.login().data
        logout = self.client(first["access"]).post(
            self.base + "auth/logout/", {"refresh": second["refresh"]}, format="json",
        )
        self.assertEqual(logout.status_code, 400, logout.data)
        self.assertEqual(self.client(second["access"]).get(self.base + "sites/").status_code, 200)

    def test_strict_mode_rejects_unmanaged_legacy_access_tokens(self):
        unmanaged = str(RefreshToken.for_user(self.user).access_token)
        with override_settings(DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS=True):
            denied = self.client(unmanaged).get(self.base + "sites/")
            self.assertEqual(denied.status_code, 401)
            new = self.login().data
            self.assertEqual(self.client(new["access"]).get(self.base + "sites/").status_code, 200)
