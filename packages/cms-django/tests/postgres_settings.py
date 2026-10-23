"""Isolated PostgreSQL configuration for transaction/concurrency regressions."""
import os
from .settings import *  # noqa: F403

DATABASES = {'default': {
    'ENGINE': 'django.db.backends.postgresql',
    'NAME': os.environ.get('CMS_TEST_POSTGRES_DB', 'cms_test'),
    'USER': os.environ.get('CMS_TEST_POSTGRES_USER', 'cms_test'),
    'PASSWORD': os.environ.get('CMS_TEST_POSTGRES_PASSWORD', 'cms-test-only'),
    'HOST': os.environ.get('CMS_TEST_POSTGRES_HOST', '127.0.0.1'),
    'PORT': os.environ.get('CMS_TEST_POSTGRES_PORT', '55439'),
}}
