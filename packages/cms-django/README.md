# digitalafarin-cms

Reusable Django/DRF backend for the DigitalAfarin Headless CMS + SEO platform.

## Install

```bash
pip install digitalafarin-cms[all]
```

For a local package archive:

```bash
pip install ./digitalafarin_cms-0.2.0-py3-none-any.whl
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
```

The public page resolver becomes:

```text
GET /api/cms/v1/content/resolve/?site=example.com&path=/some-page/
```

The JWT endpoint becomes:

```text
POST /api/cms/v1/auth/token/
```

## Celery Beat (optional)

Merge `digitalafarin_cms.celery.BEAT_SCHEDULE` into your host project's `CELERY_BEAT_SCHEDULE` to enable scheduled publishing.
