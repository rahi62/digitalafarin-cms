from rest_framework.routers import DefaultRouter

from .views import AuditIssueViewSet, AuditPageViewSet, AuditRunViewSet

router = DefaultRouter()
router.register("runs", AuditRunViewSet)
router.register("pages", AuditPageViewSet)
router.register("issues", AuditIssueViewSet)
urlpatterns = router.urls
