"""Disposable real Django host for integration tests. Never uses a host database."""
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages/cms-django/src"))

from django.conf import settings
from digitalafarin_cms.settings import apply_defaults

fixture_storage = Path(tempfile.mkdtemp(prefix="cms-host-backend-"))
namespace = dict(SECRET_KEY="host-fixture-only-not-a-production-secret-12345", DEBUG=True, ALLOWED_HOSTS=["127.0.0.1", "localhost"],
    ROOT_URLCONF=__name__, USE_TZ=True, TIME_ZONE="UTC", DEFAULT_AUTO_FIELD="django.db.models.BigAutoField",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": fixture_storage / "fixture.sqlite3"}},
    INSTALLED_APPS=["django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions"],
    MIDDLEWARE=[], MEDIA_URL="/media/", MEDIA_ROOT=tempfile.mkdtemp(prefix="cms-host-media-"))
apply_defaults(namespace)
settings.configure(**namespace)

import django
django.setup()
from django.core.management import call_command
from django.urls import include, path
from django.conf.urls.static import static
from django.contrib.auth import get_user_model
from digitalafarin_cms.apps.sites.models import Organization, Site, Membership
from digitalafarin_cms.apps.content.models import ContentTypeDefinition, ContentEntry

urlpatterns = [path("api/cms/v1/", include("digitalafarin_cms.urls"))] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
call_command("migrate", verbosity=0)
user = get_user_model().objects.create_user(username="host-owner", password="fixture-password")
org = Organization.objects.create(name="Host", slug="host")
site = Site.objects.create(organization=org, name="Host", domain="127.0.0.1:3197", settings={"frontend_url": "http://127.0.0.1:3197"})
Membership.objects.create(organization=org, user=user, role="owner")
kind = ContentTypeDefinition.objects.create(site=site, name="News", slug="news", collection_path="/blog", entry_path_pattern="/blog/{slug}/")
pages = ContentTypeDefinition.objects.create(site=site, name="Page", slug="page")
ContentEntry.objects.create(site=site, content_type=pages, title="Draft homepage", slug="home", path="/", blocks=[{"type": "paragraph", "data": {"text": "Preview on existing home"}}])
other_org = Organization.objects.create(name="Other", slug="other")
other = Site.objects.create(organization=other_org, name="Other", domain="other.test")
other_kind = ContentTypeDefinition.objects.create(site=other, name="News", slug="news")
ContentEntry.objects.create(site=other, content_type=other_kind, title="Other tenant secret", slug="other", path="/blog/other/", status="published")
call_command("runserver", "127.0.0.1:8197", use_reloader=False, verbosity=0)
