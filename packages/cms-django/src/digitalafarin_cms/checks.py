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


@register()
def session_authentication_checks(app_configs, **kwargs):
    """Reject host settings that can authenticate JWTs before checking revocation."""
    from django.utils.module_loading import import_string
    from digitalafarin_cms.session_auth import CmsSessionJWTAuthentication

    configured = getattr(settings, "REST_FRAMEWORK", {}).get(
        "DEFAULT_AUTHENTICATION_CLASSES", (),
    )
    try:
        first = configured[0]
        first = import_string(first) if isinstance(first, str) else first
        safe = isinstance(first, type) and issubclass(first, CmsSessionJWTAuthentication)
    except (ImportError, IndexError, KeyError, TypeError, AttributeError, ValueError):
        safe = False
    if safe:
        return []
    return [Error(
        "CMS session revocation requires a session-checking JWT authenticator first.",
        hint=("Set REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'][0] to "
              "'digitalafarin_cms.session_auth.CmsSessionJWTAuthentication' "
              "or a subclass. Host authenticators may follow it; an earlier "
              "authenticator can bypass CMS session revocation."),
        id="digitalafarin_cms.E002",
    )]


@register()
def refresh_rotation_checks(app_configs, **kwargs):
    config = getattr(settings, 'SIMPLE_JWT', {})
    if (config.get('ROTATE_REFRESH_TOKENS') is True
            and config.get('BLACKLIST_AFTER_ROTATION') is True
            and 'rest_framework_simplejwt.token_blacklist' in settings.INSTALLED_APPS):
        return []
    return [Error(
        'CMS managed refresh requires rotation and blacklist protection.',
        hint=('Enable SIMPLE_JWT ROTATE_REFRESH_TOKENS and BLACKLIST_AFTER_ROTATION, '
              'install rest_framework_simplejwt.token_blacklist and apply its migrations.'),
        id='digitalafarin_cms.E003',
    )]


@register(deploy=True)
def managed_session_deployment_checks(app_configs, **kwargs):
    from django.db import connections

    issues = []
    if not getattr(settings, 'DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS', False):
        issues.append(Warning(
            'CMS compatibility mode accepts authentication without a managed session.',
            hint=('After coordinated client rollout, set '
                  'DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS=True to require revocable sessions.'),
            id='digitalafarin_cms.W002',
        ))
    if not connections['default'].features.has_select_for_update:
        issues.append(Warning(
            'The default database cannot serialize managed refresh with row locks.',
            hint=('Use a shared transactional database with SELECT FOR UPDATE '
                  '(verified on PostgreSQL) for multi-instance session security.'),
            id='digitalafarin_cms.W003',
        ))
    return issues
