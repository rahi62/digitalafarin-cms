from rest_framework.routers import DefaultRouter

from .views import SearchImportRunViewSet, SearchPerformanceViewSet, WebhookEndpointViewSet

router = DefaultRouter()
router.register("webhooks", WebhookEndpointViewSet)
router.register("search-performance", SearchPerformanceViewSet, basename="search-performance")
router.register("search-imports", SearchImportRunViewSet, basename="search-imports")

urlpatterns = router.urls
