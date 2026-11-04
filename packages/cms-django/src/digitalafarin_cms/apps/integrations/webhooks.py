"""Signed webhook dispatcher (transactional outbox + Celery / management-command delivery).

Events: ``content.published``, ``content.unpublished``, ``content.deleted``,
``redirect.changed`` and ``site.settings_changed``.

Delivery contract (receivers should verify all of it):

* ``POST`` JSON ``{"id", "type", "created_at", "site", "data"}``
* ``X-DigitalAfarin-Event`` / ``X-DigitalAfarin-Event-Id`` (unique, stable across retries)
* ``X-DigitalAfarin-Timestamp`` (unix seconds, refreshed on every attempt)
* ``X-DigitalAfarin-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>``

2xx = delivered. 5xx, 408, 429 and network errors are retried with exponential backoff and
jitter up to ``DIGITALAFARIN_CMS_WEBHOOK_MAX_ATTEMPTS``; other 4xx fail permanently.
"""
from __future__ import annotations

import contextvars
import hashlib
import hmac
import ipaddress
import json
import logging
import random
import socket
import time
import urllib.error
import urllib.request
import uuid
from datetime import timedelta
from urllib.parse import urlsplit

from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger("digitalafarin_cms.webhooks")

EVENTS = (
    "content.published", "content.unpublished", "content.deleted",
    "redirect.changed", "site.settings_changed",
)
LEASE_SECONDS = 120
suppress_redirect_events: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "cms_suppress_redirect_events", default=False,
)


def _setting(name, default):
    return getattr(settings, f"DIGITALAFARIN_CMS_WEBHOOK_{name}", default)


def sign(secret: str, timestamp, body: bytes) -> str:
    message = str(timestamp).encode() + b"." + body
    return "v1=" + hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def serialize_body(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def backoff_seconds(attempt: int) -> float:
    """Exponential backoff, capped, with jitter in [0.5, 1.0] of the delay."""
    base = float(_setting("BACKOFF_BASE_SECONDS", 30))
    cap = float(_setting("BACKOFF_CAP_SECONDS", 3600))
    return min(cap, base * (2 ** max(0, attempt - 1))) * random.uniform(0.5, 1.0)


def emit_event(site, event_type: str, data: dict | None = None):
    """Create one delivery per subscribed endpoint, atomically with the caller's change.

    Scheduling happens in ``transaction.on_commit`` so receivers never see uncommitted state.
    """
    from .models import WebhookDelivery, WebhookEndpoint

    if event_type not in EVENTS:
        raise ValueError(f"Unknown webhook event {event_type!r}")
    endpoints = [
        endpoint for endpoint in WebhookEndpoint.objects.filter(site=site, is_active=True)
        if not endpoint.events or event_type in endpoint.events
    ]
    if not endpoints:
        return []
    event_id = uuid.uuid4()
    payload = {
        "id": str(event_id), "type": event_type, "site": site.domain,
        "created_at": timezone.now().isoformat(), "data": data or {},
    }
    now = timezone.now()
    deliveries = WebhookDelivery.objects.bulk_create([
        WebhookDelivery(endpoint=endpoint, site=site, event_id=event_id, event_type=event_type,
                        payload=payload, next_attempt_at=now)
        for endpoint in endpoints
    ])
    ids = [str(delivery.pk) for delivery in deliveries]
    transaction.on_commit(lambda: schedule_deliveries(ids))
    return deliveries


def schedule_deliveries(delivery_ids, countdown: float | None = None):
    """Hand deliveries to Celery. Failure leaves rows pending for ``cms_drain_webhooks``."""
    if _setting("DISPATCH", "celery") != "celery":
        return
    from .tasks import deliver_webhook

    for delivery_id in delivery_ids:
        try:
            if countdown:
                deliver_webhook.apply_async((delivery_id,), countdown=countdown)
            else:
                deliver_webhook.delay(delivery_id)
        except Exception:  # broker down / Celery not configured: the outbox row still exists
            logger.warning("webhook enqueue failed; delivery stays pending delivery=%s", delivery_id, exc_info=True)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _target_allowed(url: str) -> bool:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return False
    if _setting("ALLOW_PRIVATE_NETWORKS", False):
        return True
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80))
    except OSError:
        return True  # unresolved: the connection attempt fails and is retried like any network error
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if (address.is_private or address.is_loopback or address.is_link_local
                or address.is_reserved or address.is_multicast):
            return False
    return True


def post(url: str, body: bytes, headers: dict, timeout: float) -> int:
    """POST without following redirects; returns the HTTP status (raises OSError on network failure)."""
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=timeout) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def _claim(delivery_id):
    """Lease one due delivery (skip rows another worker is handling)."""
    from .models import WebhookDelivery

    now = timezone.now()
    with transaction.atomic():
        delivery = (
            WebhookDelivery.objects.select_for_update(skip_locked=True, of=("self",))
            .select_related("endpoint", "site")
            .filter(pk=delivery_id, status__in=[WebhookDelivery.Status.PENDING, WebhookDelivery.Status.RETRYING])
            .first()
        )
        if delivery is None:
            return None
        if delivery.leased_until and delivery.leased_until > now:
            return None
        if delivery.next_attempt_at and delivery.next_attempt_at > now:
            return None
        delivery.leased_until = now + timedelta(seconds=LEASE_SECONDS)
        delivery.save(update_fields=["leased_until", "updated_at"])
        return delivery


def deliver(delivery_id):
    """Attempt one delivery. Returns the resulting status, or None when it was not claimable."""
    from .models import WebhookDelivery

    delivery = _claim(delivery_id)
    if delivery is None:
        return None
    endpoint = delivery.endpoint
    delivery.attempts += 1
    status_code, error, retry = None, "", False
    if not endpoint.is_active:
        error = "Endpoint disabled."
    elif not _target_allowed(endpoint.url):
        error = "Target address is not allowed."
    else:
        body = serialize_body(delivery.payload)
        timestamp = int(time.time())
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "DigitalAfarin-CMS-Webhook/1",
            "X-DigitalAfarin-Event": delivery.event_type,
            "X-DigitalAfarin-Event-Id": str(delivery.event_id),
            "X-DigitalAfarin-Timestamp": str(timestamp),
        }
        if endpoint.secret:
            headers["X-DigitalAfarin-Signature"] = sign(endpoint.secret, timestamp, body)
        try:
            status_code = post(endpoint.url, body, headers, float(_setting("TIMEOUT_SECONDS", 10)))
        except OSError as exc:
            error, retry = f"Network error: {type(exc).__name__}", True
        else:
            if 200 <= status_code < 300:
                error = ""
            else:
                error = f"Receiver responded with HTTP {status_code}."
                retry = status_code >= 500 or status_code in (408, 429)

    now = timezone.now()
    delivery.last_status_code = status_code
    delivery.last_error = error[:500]
    delivery.leased_until = None
    reschedule = None
    if not error:
        delivery.status = WebhookDelivery.Status.DELIVERED
        delivery.delivered_at = now
        delivery.next_attempt_at = None
    elif retry and delivery.attempts < int(_setting("MAX_ATTEMPTS", 8)):
        delay = backoff_seconds(delivery.attempts)
        delivery.status = WebhookDelivery.Status.RETRYING
        delivery.next_attempt_at = now + timedelta(seconds=delay)
        reschedule = delay
    else:
        delivery.status = WebhookDelivery.Status.FAILED
        delivery.next_attempt_at = None
    delivery.save()
    type(endpoint).objects.filter(pk=endpoint.pk).update(last_status=status_code, last_called_at=now)
    host = urlsplit(endpoint.url).hostname
    log = logger.info if delivery.status == WebhookDelivery.Status.DELIVERED else logger.warning
    log("webhook %s event=%s id=%s host=%s status=%s attempts=%s",
        delivery.status, delivery.event_type, delivery.event_id, host, status_code, delivery.attempts)
    if reschedule is not None:
        schedule_deliveries([str(delivery.pk)], countdown=reschedule)
    return str(delivery.status)


def drain(limit: int = 200) -> dict:
    """Deliver everything due (for hosts without Celery); returns counts per outcome."""
    from .models import WebhookDelivery

    now = timezone.now()
    due = list(
        WebhookDelivery.objects.filter(
            status__in=[WebhookDelivery.Status.PENDING, WebhookDelivery.Status.RETRYING],
            next_attempt_at__lte=now,
        ).order_by("next_attempt_at").values_list("pk", flat=True)[:limit]
    )
    counts: dict[str, int] = {}
    for pk in due:
        result = deliver(pk)
        if result:
            counts[result] = counts.get(result, 0) + 1
    return counts
