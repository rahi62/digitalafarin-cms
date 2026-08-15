from rest_framework.routers import DefaultRouter
from .views import MediaAssetViewSet
router=DefaultRouter(); router.register("assets",MediaAssetViewSet); urlpatterns=router.urls
