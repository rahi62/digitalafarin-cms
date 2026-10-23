from contextlib import ExitStack
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import URLPattern, URLResolver, get_resolver, reverse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.test import APIClient
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken

from digitalafarin_cms.apps.sites.models import CmsUserSession


def protected_routes(patterns):
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from protected_routes(pattern.url_patterns)
        elif isinstance(pattern, URLPattern):
            view = getattr(pattern.callback, 'cls', None)
            if not view or not any(issubclass(p, IsAuthenticated) for p in view.permission_classes):
                continue
            keys = pattern.pattern.regex.groupindex
            if 'format' in keys or not pattern.name:
                continue
            kwargs = {key: str(uuid4()) for key in keys}
            yield view, reverse(pattern.name, kwargs=kwargs)


class SessionPermissionEnforcementTests(TestCase):
    def test_revoked_access_is_denied_on_every_protected_route_with_host_plain_jwt(self):
        get_user_model().objects.create_user(username='host-jwt-user', password='test-password')
        client = APIClient()
        login = client.post('/api/cms/v1/auth/token/', {
            'username': 'host-jwt-user', 'password': 'test-password',
        }, format='json')
        self.assertEqual(login.status_code, 200)
        access = login.data['access']
        sid = AccessToken(access)['cms_sid']
        client.credentials(HTTP_AUTHORIZATION='Bearer ' + access)
        routes = list(protected_routes(get_resolver().url_patterns))
        self.assertGreater(len(routes), 30, 'The test must cover the full protected API surface.')
        with ExitStack() as stack:
            for view in {view for view, _ in routes}:
                stack.enter_context(patch.object(view, 'authentication_classes', [JWTAuthentication]))
            self.assertEqual(client.get('/api/cms/v1/sites/').status_code, 200)
            CmsUserSession.objects.filter(pk=sid).update(revoked_at=timezone.now())
            for _, path in routes:
                for method in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'):
                    with self.subTest(method=method, path=path):
                        response = client.generic(method, path, data='{}', content_type='application/json')
                        self.assertEqual(response.status_code, 401)

    def test_host_authentication_cannot_attach_another_users_session(self):
        from digitalafarin_cms.apps.sites.views import SiteViewSet
        first = get_user_model().objects.create_user(username='first-host-user')
        second = get_user_model().objects.create_user(username='second-host-user')
        session = CmsUserSession.objects.create(
            user=second, refresh_expires_at=timezone.now() + timedelta(hours=1),
        )
        client = APIClient()
        client.force_authenticate(user=first, token={'cms_sid': str(session.pk)})
        with patch.object(SiteViewSet, 'authentication_classes', [JWTAuthentication]):
            self.assertIn(client.get('/api/cms/v1/sites/').status_code, (401, 403))

    def test_strict_mode_rejects_host_session_without_managed_claims(self):
        from django.test import override_settings
        user = get_user_model().objects.create_user(username='unmanaged-host-user')
        client = APIClient()
        client.force_authenticate(user=user)
        self.assertEqual(client.get('/api/cms/v1/sites/').status_code, 200)
        with override_settings(DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS=True):
            self.assertIn(client.get('/api/cms/v1/sites/').status_code, (401, 403))
