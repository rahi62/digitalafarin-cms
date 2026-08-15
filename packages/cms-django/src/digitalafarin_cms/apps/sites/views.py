from django.core.exceptions import PermissionDenied
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from .models import Membership, Organization, Site
from .serializers import MembershipSerializer, OrganizationSerializer, SiteSerializer


class OrganizationViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Organization.objects.all().order_by("name")
    serializer_class = OrganizationSerializer
    search_fields = ["name", "slug"]
    tenant_filter = "id"

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
