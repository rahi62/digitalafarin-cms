import socket
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
from digitalafarin_cms.apps.integrations import webhooks
from digitalafarin_cms.apps.integrations.models import WebhookDelivery, WebhookEndpoint
from digitalafarin_cms.apps.sites.models import Organization, Site


def addrinfo(*addresses):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 0)) for address in addresses]


REAL_GETADDRINFO = socket.getaddrinfo


def fake_dns(*addresses):
    """Fake only the non-IP names so real sockets (pinned IPs) keep working."""
    def resolver(host, port, *args, **kwargs):
        if host in {"rebind.example", "hooks.example"}:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port or 0)) for address in addresses]
        return REAL_GETADDRINFO(host, port, *args, **kwargs)
    return resolver


class ResolveTargetTests(TestCase):
    def resolve(self, url, *addresses):
        with patch("socket.getaddrinfo", return_value=addrinfo(*addresses)):
            return webhooks.resolve_target(url)

    def test_private_and_loopback_are_blocked_by_default(self):
        for address in ("127.0.0.1", "10.1.2.3", "192.168.0.9", "172.16.0.1", "169.254.169.254", "0.0.0.0"):
            with self.subTest(address=address):
                self.assertIsNone(self.resolve("http://hooks.example/h", address))

    def test_public_targets_are_allowed_and_pinned(self):
        self.assertEqual(self.resolve("https://hooks.example/h", "93.184.216.34"), "93.184.216.34")

    def test_mixed_public_and_private_resolution_is_blocked(self):
        self.assertIsNone(self.resolve("https://hooks.example/h", "93.184.216.34", "10.0.0.7"))

    @override_settings(DIGITALAFARIN_CMS_WEBHOOK_ALLOWED_HOSTS=["127.0.0.1:3000"])
    def test_allowlist_permits_only_the_listed_host_and_port(self):
        self.assertEqual(self.resolve("http://127.0.0.1:3000/api/cms/revalidate", "127.0.0.1"), "127.0.0.1")
        self.assertIsNone(self.resolve("http://127.0.0.1:3001/x", "127.0.0.1"))
        self.assertIsNone(self.resolve("http://10.0.0.5:3000/x", "10.0.0.5"))
        self.assertIsNone(self.resolve("http://localhost:3000/x", "127.0.0.1"))  # different name

    @override_settings(DIGITALAFARIN_CMS_WEBHOOK_ALLOWED_HOSTS=["next.internal"])
    def test_host_only_entry_matches_any_port_by_exact_name(self):
        self.assertEqual(self.resolve("http://next.internal:8080/x", "10.0.0.5"), "10.0.0.5")
        self.assertIsNone(self.resolve("http://evil.next.internal/x", "10.0.0.5"))
        self.assertIsNone(self.resolve("http://next.internal.evil.example/x", "10.0.0.5"))

    def test_dns_rebinding_to_a_non_allowlisted_private_ip_is_blocked(self):
        with override_settings(DIGITALAFARIN_CMS_WEBHOOK_ALLOWED_HOSTS=["trusted.example"]):
            self.assertIsNone(self.resolve("http://rebind.example/x", "169.254.169.254"))
        self.assertIsNone(self.resolve("http://rebind.example/x", "127.0.0.1"))

    def test_scheme_and_host_validation(self):
        for url in ("file:///etc/passwd", "ftp://x.example/", "http:///nohost"):
            self.assertIsNone(webhooks.resolve_target(url))


class Receiver(BaseHTTPRequestHandler):
    seen = []
    status = 200

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        Receiver.seen.append({"host": self.headers.get("Host"), "body": self.rfile.read(length), "path": self.path})
        self.send_response(Receiver.status)
        if Receiver.status in (301, 302):
            self.send_header("Location", "http://127.0.0.1:1/never")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass


class PinnedDeliveryTests(TestCase):
    def setUp(self):
        Receiver.seen, Receiver.status = [], 200
        self.server = HTTPServer(("127.0.0.1", 0), Receiver)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        org = Organization.objects.create(name="Net", slug="net")
        self.site = Site.objects.create(organization=org, name="Net", domain="net.example")
        self.endpoint = WebhookEndpoint.objects.create(
            site=self.site, name="n", url=f"http://rebind.example:{self.port}/api/cms/revalidate", secret="s")
        self.delivery = WebhookDelivery.objects.create(
            endpoint=self.endpoint, site=self.site, event_id="00000000-0000-0000-0000-000000000001",
            event_type="content.published", payload={"id": "x", "type": "content.published"},
            next_attempt_at=timezone.now())

    def deliver(self, *dns):
        with patch("socket.getaddrinfo", side_effect=fake_dns(*dns)):
            return webhooks.deliver(self.delivery.pk)

    def test_allowlisted_local_receiver_gets_the_signed_request_via_the_pinned_ip(self):
        with override_settings(DIGITALAFARIN_CMS_WEBHOOK_ALLOWED_HOSTS=[f"rebind.example:{self.port}"]):
            self.assertEqual(self.deliver("127.0.0.1"), "delivered")
        self.assertEqual(len(Receiver.seen), 1)
        self.assertEqual(Receiver.seen[0]["host"], f"rebind.example:{self.port}")  # original Host kept
        self.assertEqual(Receiver.seen[0]["path"], "/api/cms/revalidate")

    def test_not_allowlisted_private_target_is_never_contacted(self):
        self.assertEqual(self.deliver("127.0.0.1"), "failed")
        self.assertEqual(Receiver.seen, [])

    def test_redirects_are_never_followed(self):
        Receiver.status = 302
        with override_settings(DIGITALAFARIN_CMS_WEBHOOK_ALLOWED_HOSTS=[f"rebind.example:{self.port}"]):
            self.assertEqual(self.deliver("127.0.0.1"), "failed")  # 3xx: permanent, not retried
        self.assertEqual(len(Receiver.seen), 1)
        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.last_status_code, 302)
        self.assertEqual(self.delivery.attempts, 1)

    def test_connection_is_pinned_so_a_later_dns_change_cannot_redirect_it(self):
        calls = []

        def fake_post(url, body, headers, timeout, ip=None):
            calls.append(ip)
            return 200

        with override_settings(DIGITALAFARIN_CMS_WEBHOOK_ALLOWED_HOSTS=[f"rebind.example:{self.port}"]), \
                patch.object(webhooks, "post", fake_post):
            self.deliver("127.0.0.1")
        self.assertEqual(calls, ["127.0.0.1"])
