import hashlib
import hmac
import json
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition, PublishedEntry
from digitalafarin_cms.apps.content.publication import publish_snapshot, unpublish_snapshot
from digitalafarin_cms.apps.content.trash import move_to_trash
from digitalafarin_cms.apps.integrations import webhooks
from digitalafarin_cms.apps.integrations.models import WebhookDelivery, WebhookEndpoint
from digitalafarin_cms.apps.seo.models import Redirect
from digitalafarin_cms.apps.sites.models import Organization, Site

POST = "digitalafarin_cms.apps.integrations.webhooks.post"
SECRET = "whsec-test-secret"


@override_settings(DIGITALAFARIN_CMS_WEBHOOK_DISPATCH="manual", DIGITALAFARIN_CMS_WEBHOOK_ALLOW_PRIVATE_NETWORKS=True)
class WebhookBase(TestCase):
    def setUp(self):
        org = Organization.objects.create(name="Hooks", slug="hooks")
        self.site = Site.objects.create(organization=org, name="Hooks", domain="hooks.example")
        self.kind = ContentTypeDefinition.objects.create(
            site=self.site, name="Post", slug="post", collection_path="/blog", entry_path_pattern="/blog/{slug}/")
        self.endpoint = WebhookEndpoint.objects.create(
            site=self.site, name="Next", url="https://next.example/api/cms/revalidate", secret=SECRET)

    def entry(self, slug="hello", **extra):
        return ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title=slug, slug=slug,
            path=f"/blog/{slug}/", status="draft", **extra)

    def publish(self, entry):
        entry.status = "published"
        entry.published_at = entry.published_at or timezone.now()
        entry.save()
        with self.captureOnCommitCallbacks(execute=True):
            publish_snapshot(entry)

    def types(self, event=None):
        qs = WebhookDelivery.objects.all()
        return sorted(qs.values_list("event_type", flat=True)) if event is None else qs.filter(event_type=event)


class EmissionTests(WebhookBase):
    def test_exactly_one_content_published_event_per_publish(self):
        entry = self.entry()
        self.publish(entry)
        self.assertEqual(self.types(), ["content.published"])
        self.publish(entry)  # a second publish is a second event
        self.assertEqual(self.types(), ["content.published", "content.published"])

    def test_payload_lists_every_affected_url_and_slug_change_emits_one_event(self):
        entry = self.entry()
        self.publish(entry)
        entry.path = "/blog/renamed/"
        entry.slug = "renamed"
        entry.save()
        with self.captureOnCommitCallbacks(execute=True):
            publish_snapshot(entry)
        event = self.types("content.published").order_by("created_at").last()
        self.assertEqual(event.payload["data"]["paths"][:2], ["/blog/renamed/", "/blog/hello/"])
        self.assertIn("/blog/", event.payload["data"]["paths"])  # collection page
        self.assertEqual(self.types("redirect.changed").count(), 0)  # suppressed inside a publish
        self.assertEqual(len(self.types("content.published")), 2)

    def test_unpublish_and_delete_events(self):
        entry = self.entry()
        self.publish(entry)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertTrue(unpublish_snapshot(entry))
            self.assertFalse(unpublish_snapshot(entry))  # nothing live: no second event
        self.assertEqual(self.types("content.unpublished").count(), 1)
        other = self.entry("gone")
        self.publish(other)
        with self.captureOnCommitCallbacks(execute=True):
            move_to_trash(other, None)
        self.assertEqual(self.types("content.deleted").count(), 1)
        self.assertFalse(PublishedEntry.objects.filter(entry=other).exists())

    def test_redirect_and_site_settings_events(self):
        with self.captureOnCommitCallbacks(execute=True):
            redirect = Redirect.objects.create(site=self.site, source_path="/a/", destination_path="/b/", redirect_type="301")
            redirect.delete()
            self.site.settings = {"frontend_url": "https://x.example"}
            self.site.save()
        self.assertEqual(self.types(), ["redirect.changed", "redirect.changed", "site.settings_changed"])
        changed = self.types("redirect.changed").first().payload["data"]
        self.assertEqual(sorted(changed["paths"]), ["/a/", "/b/"])

    def test_event_filter_and_inactive_endpoints(self):
        self.endpoint.events = ["site.settings_changed"]
        self.endpoint.save()
        WebhookEndpoint.objects.create(site=self.site, name="off", url="https://off.example/h", is_active=False)
        self.publish(self.entry())
        self.assertEqual(WebhookDelivery.objects.count(), 0)
        self.site.save()
        self.assertEqual(self.types(), ["site.settings_changed"])

    def test_deliveries_roll_back_with_the_surrounding_transaction(self):
        try:
            with transaction.atomic():
                ContentEntry.objects.create(site=self.site, content_type=self.kind, title="n", slug="n",
                                            path="/blog/n/", status="published")
                self.assertEqual(WebhookDelivery.objects.count(), 1)
                raise RuntimeError("abort")
        except RuntimeError:
            pass
        self.assertEqual(WebhookDelivery.objects.count(), 0)

    def test_one_event_id_is_shared_by_all_endpoints_and_unique_per_endpoint(self):
        WebhookEndpoint.objects.create(site=self.site, name="Two", url="https://two.example/h")
        self.publish(self.entry())
        rows = list(WebhookDelivery.objects.all())
        self.assertEqual(len(rows), 2)
        self.assertEqual(len({row.event_id for row in rows}), 1)
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError), transaction.atomic():
            WebhookDelivery.objects.create(endpoint=rows[0].endpoint, site=self.site,
                                           event_id=rows[0].event_id, event_type="content.published")

    @override_settings(DIGITALAFARIN_CMS_WEBHOOK_DISPATCH="celery")
    def test_celery_task_is_enqueued_on_commit_not_before(self):
        with patch("digitalafarin_cms.apps.integrations.tasks.deliver_webhook.delay") as delay:
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                ContentEntry.objects.create(site=self.site, content_type=self.kind, title="n", slug="n",
                                            path="/blog/n/", status="published")
            self.assertEqual(delay.call_count, 0)
            for callback in callbacks:
                callback()
            self.assertEqual(delay.call_count, 1)

    @override_settings(DIGITALAFARIN_CMS_WEBHOOK_DISPATCH="celery")
    def test_broker_failure_keeps_the_delivery_pending(self):
        with patch("digitalafarin_cms.apps.integrations.tasks.deliver_webhook.delay", side_effect=OSError("broker down")):
            with self.captureOnCommitCallbacks(execute=True):
                ContentEntry.objects.create(site=self.site, content_type=self.kind, title="n", slug="n",
                                            path="/blog/n/", status="published")
        self.assertEqual(WebhookDelivery.objects.get().status, "pending")


class DeliveryTests(WebhookBase):
    def make(self):
        WebhookDelivery.objects.all().delete()
        ContentEntry.objects.all().delete()
        self.publish(self.entry())
        return WebhookDelivery.objects.get()

    def test_signature_timestamp_and_event_id_headers(self):
        delivery = self.make()
        with patch(POST, return_value=200) as post:
            self.assertEqual(webhooks.deliver(delivery.pk), "delivered")
        url, body, headers, timeout = post.call_args.args
        self.assertEqual(url, self.endpoint.url)
        payload = json.loads(body)
        self.assertEqual(payload["type"], "content.published")
        self.assertEqual(headers["X-DigitalAfarin-Event-Id"], payload["id"])
        timestamp = headers["X-DigitalAfarin-Timestamp"]
        expected = "v1=" + hmac.new(SECRET.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
        self.assertEqual(headers["X-DigitalAfarin-Signature"], expected)
        self.assertLess(abs(int(timestamp) - timezone.now().timestamp()), 5)
        delivery.refresh_from_db()
        self.assertEqual((delivery.status, delivery.attempts, delivery.last_status_code), ("delivered", 1, 200))
        self.assertIsNotNone(delivery.delivered_at)
        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.last_status, 200)

    def test_5xx_is_retried_with_exponential_backoff_then_gives_up(self):
        delivery = self.make()
        delays, event_ids = [], set()
        with patch(POST, return_value=503) as post, patch("digitalafarin_cms.apps.integrations.webhooks.schedule_deliveries"):
            for attempt in range(1, 9):
                WebhookDelivery.objects.filter(pk=delivery.pk).update(next_attempt_at=timezone.now(), leased_until=None)
                status = webhooks.deliver(delivery.pk)
                delivery.refresh_from_db()
                event_ids.add(post.call_args.args[2]["X-DigitalAfarin-Event-Id"])
                if status == "retrying":
                    delays.append((delivery.next_attempt_at - timezone.now()).total_seconds())
        self.assertEqual(status, "failed")
        self.assertEqual(delivery.attempts, 8)
        self.assertEqual(len(event_ids), 1)  # idempotency key stable across retries
        self.assertEqual(len(delays), 7)
        ceilings = [min(3600, 30 * 2 ** i) for i in range(7)]
        for delay, ceiling in zip(delays, ceilings):
            self.assertLessEqual(delay, ceiling + 1)
            self.assertGreaterEqual(delay, ceiling * 0.5 - 1)
        self.assertGreater(delays[3], delays[0])  # grows
        self.assertLessEqual(max(delays), 3601)  # capped

    @override_settings(DIGITALAFARIN_CMS_WEBHOOK_MAX_ATTEMPTS=2)
    def test_max_attempts_is_configurable(self):
        delivery = self.make()
        with patch(POST, return_value=500), patch("digitalafarin_cms.apps.integrations.webhooks.schedule_deliveries"):
            self.assertEqual(webhooks.deliver(delivery.pk), "retrying")
            WebhookDelivery.objects.filter(pk=delivery.pk).update(next_attempt_at=timezone.now())
            self.assertEqual(webhooks.deliver(delivery.pk), "failed")

    def test_4xx_is_not_retried(self):
        for code in (400, 401, 403, 404, 410, 422):
            with self.subTest(code=code):
                delivery = self.make()
                with patch(POST, return_value=code) as post:
                    self.assertEqual(webhooks.deliver(delivery.pk), "failed")
                self.assertEqual(post.call_count, 1)
                delivery.refresh_from_db()
                self.assertEqual((delivery.attempts, delivery.next_attempt_at), (1, None))
                self.assertIn(str(code), delivery.last_error)

    def test_429_408_and_network_errors_are_retried(self):
        for outcome in (429, 408, OSError("connection refused")):
            with self.subTest(outcome=outcome):
                delivery = self.make()
                kwargs = {"side_effect": outcome} if isinstance(outcome, Exception) else {"return_value": outcome}
                with patch(POST, **kwargs), patch("digitalafarin_cms.apps.integrations.webhooks.schedule_deliveries") as schedule:
                    self.assertEqual(webhooks.deliver(delivery.pk), "retrying")
                self.assertEqual(schedule.call_count, 1)
                self.assertGreater(schedule.call_args.kwargs["countdown"], 0)
                delivery.refresh_from_db()
                self.assertNotIn("connection refused", delivery.last_error)  # no raw exception text stored

    def test_delivered_rows_are_not_resent_and_leased_rows_are_skipped(self):
        delivery = self.make()
        with patch(POST, return_value=200) as post:
            webhooks.deliver(delivery.pk)
            self.assertIsNone(webhooks.deliver(delivery.pk))
        self.assertEqual(post.call_count, 1)
        other_delivery = WebhookDelivery.objects.get()
        WebhookDelivery.objects.filter(pk=other_delivery.pk).update(
            status="pending", leased_until=timezone.now() + timedelta(seconds=60))
        with patch(POST, return_value=200) as post:
            self.assertIsNone(webhooks.deliver(other_delivery.pk))
        self.assertEqual(post.call_count, 0)

    def test_private_network_targets_are_blocked_unless_allowed(self):
        self.endpoint.url = "http://127.0.0.1:9/hook"
        self.endpoint.save()
        delivery = self.make()
        with override_settings(DIGITALAFARIN_CMS_WEBHOOK_ALLOW_PRIVATE_NETWORKS=False), patch(POST) as post:
            self.assertEqual(webhooks.deliver(delivery.pk), "failed")
        self.assertEqual(post.call_count, 0)
        self.assertIn("not allowed", WebhookDelivery.objects.get().last_error)

    def test_no_secret_or_body_in_logs(self):
        delivery = self.make()
        with patch(POST, return_value=500), patch("digitalafarin_cms.apps.integrations.webhooks.schedule_deliveries"):
            with self.assertLogs("digitalafarin_cms.webhooks", level="INFO") as logs:
                webhooks.deliver(delivery.pk)
        text = "\n".join(logs.output)
        self.assertNotIn(SECRET, text)
        self.assertNotIn("/api/cms/revalidate", text)
        self.assertIn("next.example", text)

    def test_drain_command_delivers_due_rows_only(self):
        due = self.make()
        self.publish(self.entry("later"))
        later = WebhookDelivery.objects.exclude(pk=due.pk).get()
        WebhookDelivery.objects.filter(pk=later.pk).update(next_attempt_at=timezone.now() + timedelta(hours=1))
        out = StringIO()
        with patch(POST, return_value=204):
            call_command("cms_drain_webhooks", stdout=out)
        self.assertIn("delivered", out.getvalue())
        self.assertEqual(WebhookDelivery.objects.get(pk=due.pk).status, "delivered")
        self.assertEqual(WebhookDelivery.objects.get(pk=later.pk).status, "pending")


class SigningHelperTests(TestCase):
    def test_sign_matches_documented_scheme(self):
        body = b'{"a":1}'
        expected = "v1=" + hmac.new(b"k", b"123." + body, hashlib.sha256).hexdigest()
        self.assertEqual(webhooks.sign("k", 123, body), expected)

    def test_body_serialisation_is_canonical(self):
        self.assertEqual(webhooks.serialize_body({"b": 1, "a": "é"}), '{"a":"é","b":1}'.encode("utf-8"))
