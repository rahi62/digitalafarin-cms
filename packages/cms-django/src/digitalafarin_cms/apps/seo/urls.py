from django.urls import path
from rest_framework.routers import DefaultRouter

from .opportunity_views import seo_opportunities
from .views import (
    InternalLinkSuggestionViewSet,
    KeywordClusterViewSet,
    KeywordMappingViewSet,
    KeywordViewSet,
    RedirectViewSet,
    SchemaMarkupViewSet,
    SeoMetaViewSet,
    resolve_redirect,
)

router = DefaultRouter()
router.register("meta", SeoMetaViewSet)
router.register("schemas", SchemaMarkupViewSet)
router.register("clusters", KeywordClusterViewSet)
router.register("keywords", KeywordViewSet)
router.register("keyword-mappings", KeywordMappingViewSet)
router.register("redirects", RedirectViewSet)
router.register("internal-links", InternalLinkSuggestionViewSet)

urlpatterns = [
    path("redirect-resolve/", resolve_redirect),
    path("opportunities/", seo_opportunities, name="digitalafarin_cms_seo_opportunities"),
] + router.urls
