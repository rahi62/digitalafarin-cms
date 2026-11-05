"""Explicit DRF configuration for every CMS endpoint.

CMS views never inherit authentication, pagination or filtering from the host
project's global ``REST_FRAMEWORK`` settings. A host that only enables
``SessionAuthentication`` or ``LimitOffsetPagination`` therefore cannot change
how the CMS API authenticates or how the Admin UI reads list responses.
"""
from __future__ import annotations

from django.conf import settings
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.pagination import PageNumberPagination

from digitalafarin_cms.session_auth import CmsSessionJWTAuthentication

DEFAULT_PAGE_SIZE = 50


class CmsPageNumberPagination(PageNumberPagination):
    """``?page=N`` pagination returning ``count/next/previous/results``."""

    @property
    def page_size(self):  # type: ignore[override]
        return int(getattr(settings, "DIGITALAFARIN_CMS_PAGE_SIZE", DEFAULT_PAGE_SIZE))


def cms_filter_backends():
    from django_filters.rest_framework import DjangoFilterBackend

    return [DjangoFilterBackend, SearchFilter, OrderingFilter]


class CmsAPIViewMixin:
    """Authentication owned by the CMS (managed-session JWT)."""

    authentication_classes = [CmsSessionJWTAuthentication]


class CmsViewSetMixin(CmsAPIViewMixin):
    """Authentication, pagination and filter backends owned by the CMS."""

    pagination_class = CmsPageNumberPagination
    filter_backends = cms_filter_backends()
