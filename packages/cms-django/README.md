# digitalafarin-cms

Reusable Django/DRF backend for the DigitalAfarin Headless CMS + SEO platform.

## Install

```bash
pip install "digitalafarin-cms[all]"
```

For the v0.3 release wheel:

```bash
pip install ./digitalafarin_cms-0.3.0-py3-none-any.whl
```

## Django settings

At the end of `settings.py`:

```python
from digitalafarin_cms.settings import apply_defaults
apply_defaults(globals())
```

## Django URLs

```python
from django.urls import include, path

urlpatterns += [
    path("api/cms/v1/", include("digitalafarin_cms.urls")),
]
```

Then:

```bash
python manage.py migrate
python manage.py check
```

## Core API examples

Public page resolver:

```text
GET /api/cms/v1/content/resolve/?site=example.com&path=/some-page/
```

Public sanitized site SEO context:

```text
GET /api/cms/v1/site-context/?site=example.com
```

JWT authentication:

```text
POST /api/cms/v1/auth/token/
```

The package also provides authenticated APIs for content workflow, taxonomies, menus, SEO metadata, redirects, Audit runs, Search Performance imports and SEO Opportunities.

## Celery Beat (optional)

Merge `digitalafarin_cms.celery.BEAT_SCHEDULE` into your host project's `CELERY_BEAT_SCHEDULE` to enable scheduled publishing.

## Search Performance in v0.3

v0.3 can store page/day Search Console-compatible metrics and run Content Decay analysis. Google OAuth credential storage and automatic Google Search Console synchronization are intentionally not included in the Community Edition v0.3 package.

## Release verification

The repository CI builds this package and installs the produced wheel in a clean virtual environment. The smoke test configures Django, runs checks, applies package migrations and verifies core URL wiring before a tagged release can publish to PyPI.
