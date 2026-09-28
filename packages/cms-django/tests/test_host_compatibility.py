import sys
from io import StringIO
from types import ModuleType
from unittest.mock import patch

from django.core.management import call_command
from django.http import HttpResponse
from django.test import SimpleTestCase, RequestFactory, override_settings


class HostCompatibilityTests(SimpleTestCase):
    def test_wagtail_skips_only_cms_and_media_and_preserves_real_errors(self):
        from digitalafarin_cms.middleware import cms_aware_wagtail_redirect
        module = ModuleType("wagtail.contrib.redirects.middleware")
        class BrokenWagtail:
            def __init__(self, get_response): pass
            def __call__(self, request): raise RuntimeError("wagtailcore_site missing")
        module.RedirectMiddleware = BrokenWagtail
        with patch.dict(sys.modules, {module.__name__: module}):
            middleware = cms_aware_wagtail_redirect(lambda request: HttpResponse(status=404))
        for path in ["/api/cms/v1/content/resolve/", "/media/missing.png"]:
            self.assertEqual(middleware(RequestFactory().get(path)).status_code, 404)
        with self.assertRaisesRegex(RuntimeError, "wagtailcore_site"):
            middleware(RequestFactory().get("/ordinary-page/"))
        with self.assertRaises(RuntimeError):
            middleware(RequestFactory().get("/media-not-a-prefix/"))

    def test_settings_replaces_only_known_wagtail_redirect_middleware(self):
        from digitalafarin_cms.settings import apply_defaults
        namespace = {"MIDDLEWARE": ["custom.Auth", "wagtail.contrib.redirects.middleware.RedirectMiddleware", "custom.Other"]}
        apply_defaults(namespace)
        self.assertEqual(namespace["MIDDLEWARE"], ["custom.Auth", "digitalafarin_cms.middleware.cms_aware_wagtail_redirect", "custom.Other"])

    @override_settings(DEBUG=False, DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL="http://localhost:8000/media/")
    def test_production_media_check_rejects_localhost(self):
        from digitalafarin_cms.checks import integration_checks
        self.assertIn("digitalafarin_cms.E001", [issue.id for issue in integration_checks(None)])
