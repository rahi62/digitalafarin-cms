"""DigitalAfarin Headless CMS + SEO for Django/DRF."""

__version__ = "0.4.1"

DJANGO_APPS = (
    "digitalafarin_cms.apps.common",
    "digitalafarin_cms.apps.sites",
    "digitalafarin_cms.apps.content",
    "digitalafarin_cms.apps.seo",
    "digitalafarin_cms.apps.media_library",
    "digitalafarin_cms.apps.audit",
    "digitalafarin_cms.apps.integrations",
)

REQUIRED_DJANGO_APPS = (
    "rest_framework",
    "django_filters",
)

ALL_DJANGO_APPS = REQUIRED_DJANGO_APPS + DJANGO_APPS
