from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient


@override_settings(DIGITALAFARIN_CMS_LOGIN_LIMITS={
    'window': 60, 'ip': 100, 'account': 100, 'pair': 2,
})
class LoginRateLimitTests(TestCase):
    def setUp(self):
        get_user_model().objects.create_user(username='limited-user', password='correct-password')

    def login(self, *, username='limited-user', password='wrong', address='192.0.2.1', **headers):
        return APIClient().post('/api/cms/v1/auth/token/', {
            'username': username, 'password': password,
        }, format='json', REMOTE_ADDR=address, **headers)

    def test_independent_clients_share_budget_and_receive_retry_after(self):
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login().status_code, 401)
        denied = self.login(password='correct-password')
        self.assertEqual(denied.status_code, 429)
        self.assertGreater(int(denied['Retry-After']), 0)
        self.assertLessEqual(int(denied['Retry-After']), 60)
        self.assertNotIn('access', denied.data)
        self.assertNotIn('refresh', denied.data)

    def test_unknown_accounts_have_the_same_bounded_response(self):
        for username in ('limited-user', 'missing-account'):
            with self.subTest(username=username):
                self.assertEqual(self.login(username=username).status_code, 401)
                self.assertEqual(self.login(username=username).status_code, 401)
                self.assertEqual(self.login(username=username).status_code, 429)

    def test_spoofed_forwarded_headers_do_not_reset_budget(self):
        for value in ('198.51.100.1', '198.51.100.2'):
            self.assertEqual(self.login(HTTP_X_FORWARDED_FOR=value).status_code, 401)
        self.assertEqual(self.login(HTTP_X_FORWARDED_FOR='198.51.100.3').status_code, 429)

    def test_expired_window_allows_real_login(self):
        self.login(); self.login()
        from digitalafarin_cms.apps.sites.models import CmsLoginRateBucket
        CmsLoginRateBucket.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.login(password='correct-password').status_code, 200)

    @override_settings(DIGITALAFARIN_CMS_LOGIN_LIMITS={
        'window': 60, 'ip': 2, 'account': 100, 'pair': 100,
    })
    def test_address_budget_limits_password_spraying_across_accounts(self):
        self.login(username='first-missing')
        self.login(username='second-missing')
        self.assertEqual(self.login(username='third-missing').status_code, 429)
        self.assertEqual(self.login(username='third-missing', address='192.0.2.2').status_code, 401)

    @override_settings(DIGITALAFARIN_CMS_LOGIN_LIMITS={
        'window': 60, 'ip': 100, 'account': 2, 'pair': 100,
    })
    def test_account_budget_limits_distributed_attempts(self):
        self.login(address='192.0.2.1')
        self.login(address='192.0.2.2')
        self.assertEqual(self.login(address='192.0.2.3').status_code, 429)

    def test_invalid_limit_configuration_is_reported_by_system_checks(self):
        from django.core.checks import run_checks
        for config in ({'pair': 0}, {'window': -1}, {'ip': True}, 'invalid', {'unknown': 2}):
            with self.subTest(config=config), override_settings(DIGITALAFARIN_CMS_LOGIN_LIMITS=config):
                self.assertIn('digitalafarin_cms.E004', [issue.id for issue in run_checks()])

    def test_pruning_is_dry_run_by_default_and_preserves_active_budgets(self):
        from django.core.management import call_command
        from io import StringIO
        from digitalafarin_cms.apps.sites.models import CmsLoginRateBucket
        CmsLoginRateBucket.objects.create(key='a' * 64, attempts=2,
            expires_at=timezone.now() - timedelta(seconds=1))
        CmsLoginRateBucket.objects.create(key='b' * 64, attempts=2,
            expires_at=timezone.now() + timedelta(minutes=1))
        call_command('cms_prune_login_limits', stdout=StringIO())
        self.assertEqual(CmsLoginRateBucket.objects.count(), 2)
        call_command('cms_prune_login_limits', execute=True, stdout=StringIO())
        self.assertEqual(list(CmsLoginRateBucket.objects.values_list('key', flat=True)), ['b' * 64])


from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.db import close_old_connections
from django.test import TransactionTestCase, skipUnlessDBFeature


@skipUnlessDBFeature('has_select_for_update')
@override_settings(DIGITALAFARIN_CMS_LOGIN_LIMITS={
    'window': 60, 'ip': 100, 'account': 100, 'pair': 1,
})
class LoginLimitConcurrencyTests(TransactionTestCase):
    def test_concurrent_server_connections_cannot_exceed_the_last_available_attempt(self):
        barrier = Barrier(4)
        def attempt():
            close_old_connections()
            try:
                barrier.wait(timeout=5)
                return APIClient().post('/api/cms/v1/auth/token/', {
                    'username': 'concurrent-missing-account', 'password': 'wrong',
                }, format='json', REMOTE_ADDR='192.0.2.8').status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: attempt(), range(4)))
        self.assertEqual(sorted(results), [401, 429, 429, 429])


@override_settings(DIGITALAFARIN_CMS_LOGIN_LIMITS={
    'window': 60, 'ip': 100, 'account': 100, 'pair': 2,
})
class LoginLimitAtomicRequestsTests(TransactionTestCase):
    def test_failed_logins_consume_budget_when_host_uses_atomic_requests(self):
        from unittest.mock import patch
        from django.db import connection
        with patch.dict(connection.settings_dict, ATOMIC_REQUESTS=True):
            statuses = [APIClient().post('/api/cms/v1/auth/token/', {
                'username': 'missing-atomic-account', 'password': 'wrong',
            }, format='json', REMOTE_ADDR='192.0.2.9').status_code for _ in range(3)]
        self.assertEqual(statuses, [401, 401, 429])
