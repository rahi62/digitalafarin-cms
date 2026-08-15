"""Helpers for host Django settings.

Usage:
    from digitalafarin_cms.settings import apply_defaults
    apply_defaults(globals())

This deliberately avoids replacing host-project settings. It only fills CMS defaults.
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

    rest = dict(namespace.get("REST_FRAMEWORK", {}))
    rest.setdefault(
        "DEFAULT_AUTHENTICATION_CLASSES",
        ("rest_framework_simplejwt.authentication.JWTAuthentication",),
    )
    rest.setdefault(
        "DEFAULT_FILTER_BACKENDS",
        (
            "django_filters.rest_framework.DjangoFilterBackend",
            "rest_framework.filters.SearchFilter",
            "rest_framework.filters.OrderingFilter",
        ),
    )
    rest.setdefault("DEFAULT_PAGINATION_CLASS", "rest_framework.pagination.PageNumberPagination")
    rest.setdefault("PAGE_SIZE", 50)
    namespace["REST_FRAMEWORK"] = rest

    simple_jwt = dict(namespace.get("SIMPLE_JWT", {}))
    simple_jwt.setdefault("ACCESS_TOKEN_LIFETIME", timedelta(minutes=30))
    simple_jwt.setdefault("REFRESH_TOKEN_LIFETIME", timedelta(days=7))
    namespace["SIMPLE_JWT"] = simple_jwt

    namespace.setdefault("DIGITALAFARIN_CMS_API_PREFIX", "api/cms/v1/")
