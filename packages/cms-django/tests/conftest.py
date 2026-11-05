import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache_between_tests():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _strict_mode_force_authenticate(settings, monkeypatch):
    """Strict managed-session runs (tests.strict_settings): give force_authenticate a real session claim.

    Compatibility-mode runs are untouched. Tests that deliberately authenticate *without* a managed
    session pass an explicit ``token=`` (or live in test_session_permission_enforcement / test_managed_sessions).
    """
    if not getattr(settings, "CMS_TEST_MANAGED_FORCE_AUTH", False):
        return
    from rest_framework.test import APIClient
    from digitalafarin_cms.session_auth import CmsTokenObtainPairSerializer

    original = APIClient.force_authenticate

    def managed(self, user=None, token=None):
        if user is not None and token is None and not getattr(self, "_cms_unmanaged", False):
            token = CmsTokenObtainPairSerializer.get_token(user).access_token
        return original(self, user, token)

    monkeypatch.setattr(APIClient, "force_authenticate", managed)
