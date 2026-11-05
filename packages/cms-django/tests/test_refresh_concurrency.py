from concurrent.futures import ThreadPoolExecutor
from threading import Event
from time import monotonic
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import close_old_connections, transaction, connection
from django.test import TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from digitalafarin_cms.apps.sites.models import CmsUserSession


@skipUnlessDBFeature('has_select_for_update')
class ManagedRefreshConcurrencyTests(TransactionTestCase):
    def setUp(self):
        get_user_model().objects.create_user(username='concurrent-refresh', password='test-password')
        response = APIClient().post('/api/cms/v1/auth/token/', {
            'username': 'concurrent-refresh', 'password': 'test-password',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.refresh = response.data['refresh']
        self.sid = RefreshToken(self.refresh)['cms_sid']

    def rotate(self, started, finished):
        close_old_connections()
        try:
            started.set()
            response = APIClient().post('/api/cms/v1/auth/token/refresh/', {
                'refresh': self.refresh,
            }, format='json')
            return response.status_code
        finally:
            finished.set()
            close_old_connections()

    def wait_for_blocked_refreshes(self, count, finished):
        deadline = monotonic() + 5
        while monotonic() < deadline:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_stat_clear_snapshot()")
                cursor.execute("""SELECT count(*) FROM pg_stat_activity
                    WHERE datname = current_database() AND pid <> pg_backend_pid()
                    AND wait_event_type = 'Lock'
                    AND query LIKE '%%digitalafarin_cms_sites_cmsusersession%%'""")
                if cursor.fetchone()[0] >= count:
                    return
            if any(event.is_set() for event in finished):
                self.fail('Refresh completed without waiting for the session row lock.')
            Event().wait(0.01)
        self.fail('Refresh did not reach the PostgreSQL session lock.')

    def test_simultaneous_refreshes_wait_for_session_lock_and_only_one_rotates(self):
        started = [Event(), Event()]
        finished = [Event(), Event()]
        with ThreadPoolExecutor(max_workers=2) as pool:
            with transaction.atomic():
                CmsUserSession.objects.select_for_update().get(pk=self.sid)
                requests = [pool.submit(self.rotate, started[i], finished[i]) for i in range(2)]
                for event in started:
                    self.assertTrue(event.wait(5))
                # A server instance must not rotate while another owns the session lock.
                self.wait_for_blocked_refreshes(2, finished)
            self.assertEqual(sorted(future.result(timeout=10) for future in requests), [200, 401])

    def test_refresh_cannot_escape_a_concurrent_committing_revocation(self):
        started, finished = Event(), Event()
        with ThreadPoolExecutor(max_workers=1) as pool:
            with transaction.atomic():
                session = CmsUserSession.objects.select_for_update().get(pk=self.sid)
                session.revoked_at = timezone.now()
                session.save(update_fields=['revoked_at'])
                request = pool.submit(self.rotate, started, finished)
                self.assertTrue(started.wait(5))
                self.wait_for_blocked_refreshes(1, [finished])
            self.assertEqual(request.result(timeout=10), 401)

    def test_session_expiring_while_waiting_for_lock_cannot_refresh(self):
        started, finished = Event(), Event()
        expires = timezone.now() + timedelta(seconds=5)
        CmsUserSession.objects.filter(pk=self.sid).update(refresh_expires_at=expires)
        with ThreadPoolExecutor(max_workers=1) as pool:
            with transaction.atomic():
                CmsUserSession.objects.select_for_update().get(pk=self.sid)
                request = pool.submit(self.rotate, started, finished)
                self.assertTrue(started.wait(5))
                self.wait_for_blocked_refreshes(1, [finished])
                Event().wait(max(0, (expires - timezone.now()).total_seconds()) + 0.05)
            self.assertEqual(request.result(timeout=10), 401)
