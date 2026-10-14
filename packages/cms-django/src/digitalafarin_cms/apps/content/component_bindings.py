"""Authoring-only host component manifests, never executable code or route rewrites."""
import re
from copy import deepcopy

from django.db import IntegrityError, transaction
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin, ensure_organization_roles
from digitalafarin_cms.apps.sites.models import Membership
from .models import ComponentBindingDraft, ComponentBindingRevision


IDENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
HOST_KEY = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
BLOCKED = {"__proto__", "constructor", "prototype"}
RESERVED = {"api", "admin", "cms", "media", "_next", "static"}
SIMPLE_CONTENT = {"title", "excerpt", "slug", "path", "blocks"}
SIMPLE_SITE = {"name", "domain", "language"}
SIMPLE_SEO = {"title", "description", "og_title", "og_description", "og_image"}


class StaleComponentBinding(APIException):
    status_code = 409
    default_detail = "Binding draft was modified. Reload it before saving."
    default_code = "binding_conflict"


def safe_route(path):
    if not isinstance(path, str) or not path.startswith("/") or path.startswith("//"):
        return None
    if any(ord(char) <= 32 for char in path) or any(char in path for char in "%?#\\:{}[]*()"):
        return None
    pieces = [piece for piece in path.split("/") if piece]
    if any(piece in {".", ".."} for piece in pieces) or (pieces and pieces[0].lower() in RESERVED):
        return None
    return "/" + "/".join(pieces) + ("/" if pieces else "")


def safe_source(source):
    if not isinstance(source, str):
        return False
    parts = source.split(".")
    if len(parts) < 2 or len(parts) > 9 or any(not IDENT.fullmatch(p) or p in BLOCKED for p in parts):
        return False
    root, *rest = parts
    if root == "content":
        return len(rest) == 1 and rest[0] in SIMPLE_CONTENT or (
            len(rest) >= 2 and rest[0] == "custom_fields"
        )
    if root == "site":
        return len(rest) == 1 and rest[0] in SIMPLE_SITE
    if root == "seo":
        return len(rest) == 1 and rest[0] in SIMPLE_SEO
    return False


def validate_component_slots(slots):
    if not isinstance(slots, list) or len(slots) > 100:
        raise serializers.ValidationError("Expected an array with at most 100 component slots.")
    seen = set()
    for index, item in enumerate(slots):
        if not isinstance(item, dict):
            raise serializers.ValidationError(f"Slot {index}: expected an object.")
        if set(item) - {"id", "route", "component", "props", "required"}:
            raise serializers.ValidationError(f"Slot {index}: unsupported property.")
        name, component = item.get("id"), item.get("component")
        if not isinstance(name, str) or not IDENT.fullmatch(name) or name in BLOCKED:
            raise serializers.ValidationError(f"Slot {index}: invalid id.")
        if name in seen:
            raise serializers.ValidationError(f"Slot {index}: duplicate id.")
        seen.add(name)
        if not isinstance(component, str) or not IDENT.fullmatch(component) or component in BLOCKED:
            raise serializers.ValidationError(f"Slot {index}: invalid component name.")
        normalized = safe_route(item.get("route"))
        if normalized is None or item["route"] != normalized:
            raise serializers.ValidationError(f"Slot {index}: use a canonical static route.")
        props, required = item.get("props"), item.get("required", [])
        if not isinstance(props, dict) or len(props) > 50:
            raise serializers.ValidationError(f"Slot {index}: invalid props mapping.")
        if not isinstance(required, list) or len(required) > 50 or any(not isinstance(v, str) for v in required):
            raise serializers.ValidationError(f"Slot {index}: required props must be a list of names.")
        if len(required) != len(set(required)) or not set(required).issubset(props):
            raise serializers.ValidationError(f"Slot {index}: required props must reference defined props.")
        for prop, source in props.items():
            if not isinstance(prop, str) or not IDENT.fullmatch(prop) or prop in BLOCKED or not safe_source(source):
                raise serializers.ValidationError(f"Slot {index}: invalid prop binding.")
    return deepcopy(slots)


class ComponentBindingSerializer(serializers.ModelSerializer):
    expected_version = serializers.IntegerField(write_only=True, required=False, min_value=1)

    class Meta:
        model = ComponentBindingDraft
        fields = ["id", "site", "host_key", "slots", "version", "expected_version",
                  "created_by", "updated_by", "created_at", "updated_at"]
        read_only_fields = ["id", "version", "created_by", "updated_by", "created_at", "updated_at"]

    def validate_host_key(self, key):
        if not HOST_KEY.fullmatch(key):
            raise serializers.ValidationError("Use a lower-case host key with letters, numbers, underscores and hyphens.")
        return key

    def validate_slots(self, value):
        return validate_component_slots(value)

    def validate(self, attrs):
        if self.instance is None and attrs.get("expected_version") is not None:
            raise serializers.ValidationError({"expected_version": "Version is assigned by the server on creation."})
        if self.instance is not None:
            if attrs.get("site") and attrs["site"].pk != self.instance.site_id:
                raise serializers.ValidationError({"site": "Moving a host binding between sites is not supported."})
            if attrs.get("host_key") and attrs["host_key"] != self.instance.host_key:
                raise serializers.ValidationError({"host_key": "Host key is immutable; create a new draft."})
            if attrs.get("expected_version") is None:
                raise serializers.ValidationError({"expected_version": "Expected current version is required."})
        return attrs


class ComponentBindingViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ComponentBindingDraft.objects.select_related("site", "site__organization").all()
    serializer_class = ComponentBindingSerializer
    tenant_filter = "site__organization_id"
    write_roles = (Membership.Role.OWNER, Membership.Role.ADMIN, Membership.Role.EDITOR)
    filterset_fields = ["site", "host_key"]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def perform_create(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        with transaction.atomic():
            try:
                instance = serializer.save(created_by=self.request.user, updated_by=self.request.user, version=1)
                ComponentBindingRevision.objects.create(
                    draft=instance, version=1, slots=instance.slots, created_by=self.request.user,
                )
            except IntegrityError:
                raise serializers.ValidationError({"host_key": "A draft with this host key already exists for this site."})

    def perform_update(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        with transaction.atomic():
            instance = ComponentBindingDraft.objects.select_for_update().get(pk=serializer.instance.pk)
            requested = serializer.validated_data.pop("expected_version")
            if requested != instance.version:
                raise StaleComponentBinding()
            serializer.instance = instance
            self.validate_tenant_serializer(serializer, require_write=True)
            saved = serializer.save(version=instance.version + 1, updated_by=self.request.user)
            ComponentBindingRevision.objects.create(
                draft=saved, version=saved.version, slots=deepcopy(saved.slots), created_by=self.request.user,
            )

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        instance = self.get_object()
        rows = instance.revisions.select_related("created_by").order_by("-version")[:30]
        return Response({
            "draft_id": str(instance.pk), "current_version": instance.version,
            "results": [{
                "version": row.version, "created_at": row.created_at.isoformat(),
                "created_by": str(row.created_by_id) if row.created_by_id else None,
            } for row in rows],
        })


    def _require_approver(self, instance):
        ensure_organization_roles(
            self.request.user, instance.site.organization_id,
            (Membership.Role.OWNER, Membership.Role.ADMIN),
            "Only Owner or Admin can approve and roll back host registry configurations.",
        )

    @action(detail=True, methods=["get"], url_path="approval")
    def approval(self, request, pk=None):
        from .component_approvals import approval_state
        instance = self.get_object()
        return Response(approval_state(instance, include_history=True))

    @action(detail=True, methods=["get"], url_path="approved-manifest")
    def approved_manifest(self, request, pk=None):
        from .component_approvals import get_approved_manifest
        instance = self.get_object()
        return Response(get_approved_manifest(instance))

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        from .component_approvals import change_approval
        instance = self.get_object()
        self._require_approver(instance)
        return Response(change_approval(instance, request.user, action="approve", data=request.data))

    @action(detail=True, methods=["post"], url_path="rollback-approval")
    def rollback_approval(self, request, pk=None):
        from .component_approvals import change_approval
        instance = self.get_object()
        self._require_approver(instance)
        return Response(change_approval(instance, request.user, action="rollback", data=request.data))
