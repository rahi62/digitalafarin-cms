from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import (
    TenantScopedViewSetMixin,
    ensure_organization_roles,
)
from .models import Membership, Organization, Site
from .serializers import MembershipSerializer, OrganizationSerializer, SiteSerializer
from .site_settings import public_site_context, validate_site_settings


class OrganizationViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Organization.objects.all().order_by("name")
    serializer_class = OrganizationSerializer
    search_fields = ["name", "slug"]
    tenant_filter = "id"
    write_roles = (Membership.Role.OWNER, Membership.Role.ADMIN)

    def perform_create(self, serializer):
        organization = serializer.save()
        Membership.objects.get_or_create(
            organization=organization,
            user=self.request.user,
            defaults={"role": Membership.Role.OWNER},
        )


class SiteViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Site.objects.select_related("organization").all().order_by("name")
    serializer_class = SiteSerializer
    filterset_fields = ["organization", "is_active"]
    search_fields = ["name", "domain"]
    tenant_filter = "organization_id"
    write_roles = (Membership.Role.OWNER, Membership.Role.ADMIN)

    @action(detail=True, methods=["get", "patch"], url_path="cms-settings")
    def cms_settings(self, request, pk=None):
        # Use the tenant-scoped queryset directly rather than get_object() so SEO Managers
        # can update CMS/SEO settings without gaining permission to edit domain/site identity.
        site = get_object_or_404(self.get_queryset(), pk=pk)
        if request.method == "GET":
            return Response({"site": str(site.id), "settings": site.settings or {}})

        ensure_organization_roles(
            request.user,
            site.organization_id,
            (Membership.Role.OWNER, Membership.Role.ADMIN, Membership.Role.SEO),
            "Owner, Admin or SEO Manager role is required to update CMS settings.",
        )
        incoming = request.data.get("settings", request.data)
        if not isinstance(incoming, dict):
            return Response({"detail": "settings must be an object"}, status=400)

        merged = dict(site.settings or {})
        for key, value in incoming.items():
            merged[key] = value
        merged = validate_site_settings(merged)
        site.settings = merged
        site.save(update_fields=["settings", "updated_at"])
        return Response({"site": str(site.id), "settings": site.settings})


class MembershipViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Membership.objects.select_related("organization", "user").all()
    serializer_class = MembershipSerializer
    filterset_fields = ["organization", "role"]
    tenant_filter = "organization_id"

    def _require_org_admin(self, organization):
        if self.request.user.is_superuser:
            return
        allowed_roles = [Membership.Role.OWNER, Membership.Role.ADMIN]
        if not Membership.objects.filter(
            organization=organization,
            user=self.request.user,
            role__in=allowed_roles,
        ).exists():
            raise PermissionDenied("Owner or admin role is required to manage memberships.")

    def perform_create(self, serializer):
        self.validate_tenant_serializer(serializer)
        self._require_org_admin(serializer.validated_data["organization"])
        serializer.save()

    def perform_update(self, serializer):
        self._require_org_admin(self.get_object().organization)
        self.validate_tenant_serializer(serializer)
        serializer.save()

    def perform_destroy(self, instance):
        self._require_org_admin(instance.organization)
        instance.delete()


@api_view(["GET"])
@permission_classes([AllowAny])
def public_site_context_view(request):
    domain = (request.query_params.get("site") or "").strip()
    if not domain:
        return Response({"detail": "site query parameter is required"}, status=400)
    site = Site.objects.filter(domain=domain, is_active=True).first()
    if site is None:
        return Response({"detail": "Site not found"}, status=404)
    return Response(public_site_context(site))
