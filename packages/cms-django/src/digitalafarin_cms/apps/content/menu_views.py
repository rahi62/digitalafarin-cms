from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from digitalafarin_cms.apps.sites.models import Site
from .models import Menu, MenuItem
from .serializers import MenuItemSerializer, MenuSerializer


class MenuItemViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = MenuItem.objects.select_related("menu", "menu__site", "parent").all()
    serializer_class = MenuItemSerializer
    filterset_fields = ["menu", "parent", "is_external"]
    search_fields = ["label", "url"]
    ordering_fields = ["sort_order", "created_at", "label"]
    tenant_filter = "menu__site__organization_id"


@api_view(["GET"])
@permission_classes([AllowAny])
def resolve_menu(request):
    domain = (request.query_params.get("site") or "").strip()
    key = (request.query_params.get("key") or "").strip()
    if not domain or not key:
        return Response({"detail": "site and key are required"}, status=400)

    try:
        site = Site.objects.get(domain=domain, is_active=True)
    except Site.DoesNotExist:
        return Response({"detail": "Site not found"}, status=404)

    try:
        menu = Menu.objects.prefetch_related("items__children").get(site=site, key=key)
    except Menu.DoesNotExist:
        return Response({"detail": "Menu not found"}, status=404)

    return Response(MenuSerializer(menu).data)
