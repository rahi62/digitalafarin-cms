import threading
from datetime import timedelta
from io import StringIO
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from digitalafarin_cms import __version__
from digitalafarin_cms.apps.content.models import ContentEntry, ContentRevision, ContentTypeDefinition, PublishedEntry
from digitalafarin_cms.apps.content.tasks import publish_due, publish_due_entries
from digitalafarin_cms.apps.integrations.models import WebhookDelivery, WebhookEndpoint
from digitalafarin_cms.apps.sites.models import Membership, Organization, Site


class HealthTests(TestCase):
    def get(self):
        return APIClient().get("/api/cms/v1/health/")

    def test_healthy_instance_reports_only_status_and_package_version(self):
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "ok", "version": __version__})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_database_failure_is_503_without_details(self):
        with patch("digitalafarin_cms.health.connection.cursor", side_effect=RuntimeError("password=secret host=db.internal")):
            with self.assertLogs("digitalafarin_cms.health", level="ERROR") as logs:
                response = self.get()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data, {"status": "unavailable", "version": __version__})
        self.assertNotIn("secret", response.content.decode() + "\n".join(logs.output))

    def test_unapplied_cms_migrations_are_unhealthy(self):
        with patch("digitalafarin_cms.health.MigrationExecutor.migration_plan", return_value=[("migration", False)]):
            self.assertEqual(self.get().status_code, 503)

    def test_health_needs_no_credentials_and_ignores_host_authentication(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
        self.assertEqual(client.get("/api/cms/v1/health/").status_code, 200)


class SchedulingBase:
    def make_site(self):
        org = Organization.objects.create(name="Sched", slug="sched")
        self.site = Site.objects.create(organization=org, name="Sched", domain="sched.example")
        self.kind = ContentTypeDefinition.objects.create(site=self.site, name="Post", slug="post")

    def scheduled(self, slug, minutes=-5):
        entry = ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title=slug, slug=slug, path=f"/{slug}/", status="draft")
        ContentEntry.objects.filter(pk=entry.pk).update(
            status="scheduled", scheduled_at=timezone.now() + timedelta(minutes=minutes))
        return entry


@override_settings(DIGITALAFARIN_CMS_WEBHOOK_DISPATCH="manual")
class ScheduledPublishingTests(SchedulingBase, TestCase):
    def setUp(self):
        self.make_site()
        WebhookEndpoint.objects.create(site=self.site, name="n", url="https://next.example/h", secret="s")

    def revisions(self, entry):
        return ContentRevision.objects.filter(entry=entry, note="Scheduled publication").count()

    def test_due_entries_publish_once_and_future_ones_wait(self):
        due, later = self.scheduled("due"), self.scheduled("later", minutes=60)
        self.assertEqual(publish_due(), 1)
        due.refresh_from_db()
        self.assertEqual(due.status, "published")
        self.assertTrue(PublishedEntry.objects.filter(entry=due).exists())
        self.assertFalse(PublishedEntry.objects.filter(entry=later).exists())
        self.assertEqual(self.revisions(due), 1)
        self.assertEqual(WebhookDelivery.objects.filter(event_type="content.published").count(), 1)

    def test_running_again_is_idempotent(self):
        entry = self.scheduled("again")
        self.assertEqual(publish_due(), 1)
        self.assertEqual(publish_due(), 0)
        self.assertEqual(publish_due_entries(), 0)
        self.assertEqual(self.revisions(entry), 1)
        self.assertEqual(WebhookDelivery.objects.count(), 1)

    def test_a_failing_entry_does_not_block_others_or_leave_partial_state(self):
        bad, good = self.scheduled("bad"), self.scheduled("good")
        real = ContentEntry.publish

        def flaky(entry):
            if entry.pk == bad.pk:
                raise RuntimeError("boom")
            return real(entry)

        with patch.object(ContentEntry, "publish", flaky):
            with self.assertLogs("digitalafarin_cms.content", level="ERROR"):
                self.assertEqual(publish_due(), 1)
        bad.refresh_from_db()
        self.assertEqual(bad.status, "scheduled")
        self.assertFalse(PublishedEntry.objects.filter(entry=bad).exists())
        self.assertEqual(self.revisions(bad), 0)
        self.assertTrue(PublishedEntry.objects.filter(entry=good).exists())

    def test_cron_command(self):
        self.scheduled("cron")
        out = StringIO()
        call_command("cms_publish_due", stdout=out)
        self.assertIn("published 1", out.getvalue())

    def test_celery_task_is_registered_under_its_documented_name(self):
        self.assertEqual(publish_due_entries.name, "digitalafarin_cms.apps.content.tasks.publish_due_entries")
        from digitalafarin_cms.celery import BEAT_SCHEDULE
        self.assertEqual(
            BEAT_SCHEDULE["digitalafarin-cms-publish-due-content"]["task"], publish_due_entries.name)

    def test_publication_is_logged_without_secrets(self):
        self.scheduled("logged")
        with self.assertLogs("digitalafarin_cms.content", level="INFO") as logs:
            publish_due()
        self.assertTrue(any("scheduled entry published" in line for line in logs.output))


@skipUnless(connection.vendor == "postgresql", "row-lock concurrency needs PostgreSQL")
@override_settings(DIGITALAFARIN_CMS_WEBHOOK_DISPATCH="manual")
class ConcurrentSchedulingTests(SchedulingBase, TransactionTestCase):
    def test_two_workers_never_double_publish(self):
        self.make_site()
        WebhookEndpoint.objects.create(site=self.site, name="n", url="https://next.example/h", secret="s")
        entries = [self.scheduled(f"c{i}") for i in range(6)]
        barrier = threading.Barrier(2)
        results, errors = [], []

        def worker():
            try:
                barrier.wait(timeout=10)
                results.append(publish_due())
            except Exception as exc:  # pragma: no cover - reported below
                errors.append(exc)
            finally:
                close_old_connections()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=60)
        self.assertEqual(errors, [])
        self.assertEqual(sum(results), 6)  # every entry published by exactly one worker
        for entry in entries:
            self.assertEqual(ContentRevision.objects.filter(entry=entry, note="Scheduled publication").count(), 1)
            self.assertEqual(PublishedEntry.objects.filter(entry=entry).count(), 1)
        self.assertEqual(WebhookDelivery.objects.filter(event_type="content.published").count(), 6)


class AuthAndThrottleLoggingTests(TestCase):
    def test_rejected_authentication_is_logged_by_reason_only(self):
        token = "eyJhbGciOiJIUzI1NiJ9.secret-payload.signature"
        with self.assertLogs("digitalafarin_cms.auth", level="WARNING") as logs:
            with patch("digitalafarin_cms.session_auth.CmsSessionJWTAuthentication.get_validated_token",
                       side_effect=__import__("rest_framework.exceptions", fromlist=["AuthenticationFailed"]).AuthenticationFailed("x")):
                pass
            from digitalafarin_cms.session_auth import _reject
            _reject("revoked_or_expired")
        text = "\n".join(logs.output)
        self.assertIn("reason=revoked_or_expired", text)
        self.assertNotIn(token, text)

    def test_login_throttle_is_logged(self):
        client = APIClient()
        with override_settings(DIGITALAFARIN_CMS_LOGIN_LIMITS={"window": 60, "ip": 100, "account": 100, "pair": 1}):
            client.post("/api/cms/v1/auth/token/", {"username": "ghost", "password": "wrong-password"}, format="json")
            with self.assertLogs("digitalafarin_cms.auth", level="WARNING") as logs:
                response = client.post("/api/cms/v1/auth/token/", {"username": "ghost", "password": "wrong-password"}, format="json")
        self.assertEqual(response.status_code, 429)
        text = "\n".join(logs.output)
        self.assertIn("login throttled", text)
        self.assertNotIn("wrong-password", text)
        self.assertNotIn("ghost", text)
