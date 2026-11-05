"""Helpers for host Django settings.

Usage:
    from digitalafarin_cms.settings import apply_defaults
    apply_defaults(globals())

This deliberately avoids replacing host-project settings. It only fills CMS defaults and never edits REST_FRAMEWORK.
"""
from __future__ import annotations

from datetime import timedelta

from digitalafarin_cms import ALL_DJANGO_APPS


def apply_defaults(namespace: dict) -> None:
    installed = list(namespace.get("INSTALLED_APPS", []))
    for app in ALL_DJANGO_APPS:
        if app not in installed:
            installed.append(app)
    namespace["INSTALLED_APPS"] = installed

    # CMS views set their own authentication, pagination and filter backends
    # (digitalafarin_cms.api), so the host project's REST_FRAMEWORK is left untouched.

    simple_jwt = dict(namespace.get("SIMPLE_JWT", {}))
    simple_jwt.setdefault("ACCESS_TOKEN_LIFETIME", timedelta(minutes=30))
    simple_jwt.setdefault("REFRESH_TOKEN_LIFETIME", timedelta(days=7))
    simple_jwt.setdefault("ROTATE_REFRESH_TOKENS", True)
    simple_jwt.setdefault("BLACKLIST_AFTER_ROTATION", True)
    namespace["SIMPLE_JWT"] = simple_jwt

    namespace.setdefault("DIGITALAFARIN_CMS_API_PREFIX", "api/cms/v1/")
    if "MIDDLEWARE" in namespace:
        namespace["MIDDLEWARE"] = [
            "digitalafarin_cms.middleware.cms_aware_wagtail_redirect"
            if item == "wagtail.contrib.redirects.middleware.RedirectMiddleware" else item
            for item in namespace["MIDDLEWARE"]
        ]
