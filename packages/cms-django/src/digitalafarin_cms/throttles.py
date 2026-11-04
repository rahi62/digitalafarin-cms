"""Scoped throttles for the public (unauthenticated) CMS endpoints.

Rates come from ``DIGITALAFARIN_CMS_THROTTLE_RATES`` (merged over the defaults below),
never from the host's ``REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']``. Set a scope to
``None`` to disable it. Counters use Django's cache, so use a shared cache (Redis,
Memcached) when running more than one process.

The client address is ``REMOTE_ADDR`` only; forwarded headers are never trusted. A
Next.js server fetching on behalf of visitors appears as one address, so the defaults
are intentionally generous: they stop abuse, not normal rendering traffic.
"""
from __future__ import annotations

import logging

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle

logger = logging.getLogger("digitalafarin_cms.throttle")

DEFAULT_RATES = {
    "resolve": "1200/min",
    "public_entries": "600/min",
    "menu_resolve": "600/min",
    "site_context": "600/min",
    "redirect_resolve": "1200/min",
    "sitemap": "120/min",
    "robots": "120/min",
}


def throttle_rates() -> dict:
    rates = dict(DEFAULT_RATES)
    rates.update(getattr(settings, "DIGITALAFARIN_CMS_THROTTLE_RATES", {}) or {})
    return rates


class CmsScopedThrottle(SimpleRateThrottle):
    scope = ""

    def get_rate(self):
        return throttle_rates().get(self.scope)

    def get_cache_key(self, request, view):
        address = request.META.get("REMOTE_ADDR") or "unknown"
        return self.cache_format % {"scope": f"cms_{self.scope}", "ident": address}

    def allow_request(self, request, view):
        allowed = super().allow_request(request, view)
        if not allowed:
            logger.warning("public endpoint throttled scope=%s", self.scope)
        return allowed


def _make(scope: str):
    return type(f"Cms{scope.title().replace('_', '')}Throttle", (CmsScopedThrottle,), {"scope": scope})


ResolveThrottle = _make("resolve")
PublicEntriesThrottle = _make("public_entries")
MenuResolveThrottle = _make("menu_resolve")
SiteContextThrottle = _make("site_context")
RedirectResolveThrottle = _make("redirect_resolve")
SitemapThrottle = _make("sitemap")
RobotsThrottle = _make("robots")
