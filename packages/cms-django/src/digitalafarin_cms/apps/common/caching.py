"""Cache headers and conditional GET for the public (anonymous) CMS responses.

Successful public responses get ``Cache-Control: public, max-age=0, s-maxage=N,
stale-while-revalidate=M`` plus a weak ETag (``If-None-Match`` -> 304). Everything else
(errors, previews) stays ``no-store``. Tune with:

* ``DIGITALAFARIN_CMS_CACHE_S_MAXAGE`` (default 60; ``0`` disables shared caching)
* ``DIGITALAFARIN_CMS_CACHE_STALE_WHILE_REVALIDATE`` (default 300)
"""
from __future__ import annotations

import functools
import hashlib
import json

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotModified

NO_STORE = "no-store"


def cache_control_value() -> str:
    s_maxage = int(getattr(settings, "DIGITALAFARIN_CMS_CACHE_S_MAXAGE", 60))
    if s_maxage <= 0:
        return NO_STORE
    swr = max(0, int(getattr(settings, "DIGITALAFARIN_CMS_CACHE_STALE_WHILE_REVALIDATE", 300)))
    return f"public, max-age=0, s-maxage={s_maxage}, stale-while-revalidate={swr}"


def _etag_for(response) -> str:
    if hasattr(response, "data"):
        body = json.dumps(response.data, sort_keys=True, default=str, ensure_ascii=False).encode("utf-8")
    else:
        body = response.content
    return 'W/"%s"' % hashlib.sha256(body).hexdigest()[:32]


def _matches(header: str, etag: str) -> bool:
    candidates = [part.strip() for part in header.split(",")]
    return "*" in candidates or etag in candidates or etag[2:] in candidates


def apply_public_cache(request, response):
    """Add shared-cache headers to a successful anonymous response."""
    control = cache_control_value()
    if response.status_code != 200 or control == NO_STORE:
        response["Cache-Control"] = NO_STORE
        return response
    etag = _etag_for(response)
    header = request.META.get("HTTP_IF_NONE_MATCH", "")
    if header and _matches(header, etag):
        not_modified = HttpResponseNotModified()
        not_modified["ETag"] = etag
        not_modified["Cache-Control"] = control
        return not_modified
    response["ETag"] = etag
    response["Cache-Control"] = control
    return response


def public_cache(view):
    """Decorator for anonymous GET views (apply beneath ``@api_view``)."""

    @functools.wraps(view)
    def wrapper(request, *args, **kwargs):
        return apply_public_cache(request, view(request, *args, **kwargs))

    return wrapper
