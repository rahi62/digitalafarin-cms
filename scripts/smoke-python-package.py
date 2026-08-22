"""Smoke-test the built/installed DigitalAfarin CMS wheel as a host project would."""
from django.conf import settings

from digitalafarin_cms import __version__
from digitalafarin_cms.settings import apply_defaults


namespace = {
    "SECRET_KEY": "digitalafarin-package-smoke",
    "DEBUG": False,
    "ALLOWED_HOSTS": ["testserver", "localhost"],
    "ROOT_URLCONF": "digitalafarin_cms.urls",
    "USE_TZ": True,
    "TIME_ZONE": "UTC",
    "DEFAULT_AUTO_FIELD": "django.db.models.BigAutoField",
    "DATABASES": {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
    "INSTALLED_APPS": [
        "django.contrib.auth",
        "django.contrib.contenttypes",
        "django.contrib.sessions",
    ],
    "MIDDLEWARE": [],
}
apply_defaults(namespace)
settings.configure(**namespace)

import django  # noqa: E402

django.setup()

from django.core.management import call_command  # noqa: E402
from django.urls import resolve  # noqa: E402
from digitalafarin_cms.apps.sites.models import Organization, Site  # noqa: E402


call_command("check", verbosity=0)
call_command("migrate", interactive=False, verbosity=0)

organization = Organization.objects.create(name="Package Smoke", slug="package-smoke")
site = Site.objects.create(
    organization=organization,
    name="Smoke Site",
    domain="smoke.example",
)

assert Site.objects.filter(pk=site.pk).exists()
assert resolve("/sites/").url_name in {"site-list", "site-list"}
assert resolve("/content/entries/").url_name in {"contententry-list", "contententry-list"}
assert resolve("/seo/opportunities/").url_name == "digitalafarin_cms_seo_opportunities"

print(f"digitalafarin-cms {__version__}: installed wheel, Django setup, migrations and URL wiring OK")
