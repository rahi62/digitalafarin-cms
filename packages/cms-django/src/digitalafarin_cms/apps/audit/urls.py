from rest_framework.routers import DefaultRouter
from .views import AuditRunViewSet, AuditIssueViewSet
router=DefaultRouter(); router.register("runs",AuditRunViewSet); router.register("issues",AuditIssueViewSet); urlpatterns=router.urls
