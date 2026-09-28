"""Optional Wagtail interoperability; no database exceptions are intercepted."""
from importlib import import_module
from urllib.parse import urlsplit

from asgiref.sync import iscoroutinefunction
from django.conf import settings
from django.utils.decorators import sync_and_async_middleware


def excluded_from_wagtail(path):
    prefixes = ["/" + getattr(settings, "DIGITALAFARIN_CMS_API_PREFIX", "api/cms/v1/").strip("/") + "/",
                "/media/", urlsplit(getattr(settings, "MEDIA_URL", "/media/")).path]
    return any(prefix and prefix != "/" and (path == prefix.rstrip("/") or path.startswith(prefix.rstrip("/") + "/")) for prefix in prefixes)


@sync_and_async_middleware
def cms_aware_wagtail_redirect(get_response):
    original = import_module("wagtail.contrib.redirects.middleware").RedirectMiddleware(get_response)
    if iscoroutinefunction(get_response):
        async def middleware(request):
            return await (get_response(request) if excluded_from_wagtail(request.path_info) else original(request))
    else:
        def middleware(request):
            return get_response(request) if excluded_from_wagtail(request.path_info) else original(request)
    return middleware
