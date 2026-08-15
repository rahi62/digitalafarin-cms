from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from .models import WebhookEndpoint
from .serializers import WebhookEndpointSerializer


class WebhookEndpointViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WebhookEndpoint.objects.select_related("site").all()
    serializer_class = WebhookEndpointSerializer
    filterset_fields = ["site", "is_active"]
    search_fields = ["name", "url"]
    tenant_filter = "site__organization_id"
