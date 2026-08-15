from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from .models import MenuItem
from .serializers import MenuItemSerializer


class MenuItemViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = MenuItem.objects.select_related("menu", "menu__site", "parent").all()
    serializer_class = MenuItemSerializer
    filterset_fields = ["menu", "parent", "is_external"]
    search_fields = ["label", "url"]
    ordering_fields = ["sort_order", "created_at", "label"]
    tenant_filter = "menu__site__organization_id"
