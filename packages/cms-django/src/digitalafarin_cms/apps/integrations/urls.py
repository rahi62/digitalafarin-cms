from rest_framework.routers import DefaultRouter
from .views import WebhookEndpointViewSet
router=DefaultRouter(); router.register("webhooks",WebhookEndpointViewSet); urlpatterns=router.urls
