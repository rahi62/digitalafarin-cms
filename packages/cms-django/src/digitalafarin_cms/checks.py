from urllib.parse import urlsplit

from django.conf import settings
from django.core.checks import Error, Warning, register


@register()
def integration_checks(app_configs, **kwargs):
    issues = []
    media = getattr(settings, "DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL", "") or getattr(settings, "MEDIA_URL", "/media/")
    parsed = urlsplit(media)
    if parsed.scheme and (parsed.scheme not in {"http", "https"} or parsed.username or parsed.password or parsed.query or parsed.fragment):
        issues.append(Error("CMS public media URL must be an HTTP(S) base without credentials, query or fragment.", id="digitalafarin_cms.E001"))
    if not settings.DEBUG and parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        issues.append(Error("CMS public media URL points to localhost in production.", hint="Use /media/ with the fixed upstream handler or a public storage/CDN URL.", id="digitalafarin_cms.E001"))
    if "wagtail.contrib.redirects.middleware.RedirectMiddleware" in getattr(settings, "MIDDLEWARE", []):
        issues.append(Warning("Wagtail redirect middleware may process CMS/media 404 responses.", hint="Call apply_defaults after MIDDLEWARE is defined, or use digitalafarin_cms.middleware.cms_aware_wagtail_redirect.", id="digitalafarin_cms.W001"))
    return issues
