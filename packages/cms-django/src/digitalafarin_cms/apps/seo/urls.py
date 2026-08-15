from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import SeoMetaViewSet, SchemaMarkupViewSet, KeywordClusterViewSet, KeywordViewSet, KeywordMappingViewSet, RedirectViewSet, InternalLinkSuggestionViewSet, resolve_redirect
router=DefaultRouter(); router.register("meta",SeoMetaViewSet); router.register("schemas",SchemaMarkupViewSet); router.register("clusters",KeywordClusterViewSet); router.register("keywords",KeywordViewSet); router.register("keyword-mappings",KeywordMappingViewSet); router.register("redirects",RedirectViewSet); router.register("internal-links",InternalLinkSuggestionViewSet)
urlpatterns=[path("redirect-resolve/",resolve_redirect)] + router.urls
