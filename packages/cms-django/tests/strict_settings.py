"""Whole suite with strict managed sessions (the 0.8.0 default)."""
from .postgres_settings import *  # noqa: F401,F403

DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS = True

CMS_TEST_MANAGED_FORCE_AUTH = True
