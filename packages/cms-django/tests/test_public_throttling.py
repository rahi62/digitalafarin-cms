from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from digitalafarin_cms.apps.sites.models import Organization, Site
from digitalafarin_cms.throttles import DEFAULT_RATES

BASE = "/api/cms/v1/"
ENDPOINTS = {
    "resolve": "content/resolve/",
    "public_entries": "content/public-entries/",
    "menu_resolve": "content/menu-resolve/",
    "site_context": "site-context/",
    "redirect_resolve": "seo/redirect-resolve/",
    "sitemap": "content/sitemap/",
    "robots": "content/robots/",
}


class PublicThrottlingTests(TestCase):
    def setUp(self):
        cache.clear()
        org = Organization.objects.create(name="T", slug="t-org")
        self.site = Site.objects.create(organization=org, name="T", domain="t.example")
        self.client = APIClient()

    def hit(self, scope):
        return self.client.get(BASE + ENDPOINTS[scope], {"site": "t.example", "path": "/x"})

    def test_every_public_scope_has_a_default_rate(self):
        self.assertEqual(set(ENDPOINTS), set(DEFAULT_RATES))

    def test_each_scope_throttles_after_its_configured_rate(self):
        rates = {scope: "2/min" for scope in ENDPOINTS}
        with override_settings(DIGITALAFARIN_CMS_THROTTLE_RATES=rates):
            for scope in ENDPOINTS:
                cache.clear()
                with self.subTest(scope=scope):
                    first, second, third = self.hit(scope), self.hit(scope), self.hit(scope)
                    self.assertNotEqual(first.status_code, 429)
                    self.assertNotEqual(second.status_code, 429)
                    self.assertEqual(third.status_code, 429)
                    self.assertIn("Retry-After", third)

    def test_scopes_are_independent(self):
        with override_settings(DIGITALAFARIN_CMS_THROTTLE_RATES={"resolve": "1/min"}):
            self.hit("resolve")
            self.assertEqual(self.hit("resolve").status_code, 429)
            self.assertNotEqual(self.hit("robots").status_code, 429)

    def test_scope_can_be_disabled(self):
        with override_settings(DIGITALAFARIN_CMS_THROTTLE_RATES={"robots": None}):
            for _ in range(10):
                self.assertNotEqual(self.hit("robots").status_code, 429)

    def test_host_global_throttle_rates_do_not_apply(self):
        host = {"DEFAULT_THROTTLE_CLASSES": [], "DEFAULT_THROTTLE_RATES": {"resolve": "1/min"}}
        with override_settings(REST_FRAMEWORK=host):
            for _ in range(5):
                self.assertNotEqual(self.hit("resolve").status_code, 429)

    def test_forwarded_header_cannot_evade_the_limit(self):
        with override_settings(DIGITALAFARIN_CMS_THROTTLE_RATES={"resolve": "1/min"}):
            self.client.get(BASE + ENDPOINTS["resolve"], {"site": "t.example"}, HTTP_X_FORWARDED_FOR="1.1.1.1")
            second = self.client.get(BASE + ENDPOINTS["resolve"], {"site": "t.example"}, HTTP_X_FORWARDED_FOR="2.2.2.2")
            self.assertEqual(second.status_code, 429)
