from __future__ import annotations

from collections.abc import Iterable

from django.core.exceptions import PermissionDenied
from django.db.models import Model


def allowed_organization_ids(user):
    """Return None for superusers, otherwise the organization ids visible to the user."""
    if not getattr(user, "is_authenticated", False):
        return []
    if getattr(user, "is_superuser", False):
        return None

    from digitalafarin_cms.apps.sites.models import Membership

    return list(
        Membership.objects.filter(user=user, organization__is_active=True).values_list(
            "organization_id", flat=True
        )
    )


def organization_role(user, organization_id):
    """Return the user's role for one organization, or 'superuser'/None."""
    if not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "is_superuser", False):
        return "superuser"
    if organization_id is None:
        return None

    from digitalafarin_cms.apps.sites.models import Membership

    return (
        Membership.objects.filter(
            organization_id=organization_id,
            user=user,
            organization__is_active=True,
        )
        .values_list("role", flat=True)
        .first()
    )


def user_has_organization_role(user, organization_id, roles) -> bool:
    role = organization_role(user, organization_id)
    return role == "superuser" or role in set(roles)


def ensure_organization_roles(user, organization_id, roles, message=None) -> None:
    if user_has_organization_role(user, organization_id, roles):
        return
    raise PermissionDenied(message or "Your role does not allow this action.")


def ensure_organization_access(user, organization_id) -> None:
    if organization_id is None or getattr(user, "is_superuser", False):
        return
    allowed = allowed_organization_ids(user)
    if organization_id not in allowed:
        raise PermissionDenied("You do not have access to this organization.")


def ensure_organization_write_access(user, organization_id, allowed_roles=None) -> None:
    if organization_id is None or getattr(user, "is_superuser", False):
        return

    from digitalafarin_cms.apps.sites.models import Membership

    roles = allowed_roles or (
        Membership.Role.OWNER,
        Membership.Role.ADMIN,
        Membership.Role.SEO,
        Membership.Role.EDITOR,
        Membership.Role.WRITER,
    )
    if not Membership.objects.filter(
        organization_id=organization_id, user=user, role__in=roles
    ).exists():
        raise PermissionDenied("Your role does not allow changes in this organization.")


def organization_id_for_instance(value: Model | None, _seen: set[int] | None = None):
    """Best-effort organization resolution for CMS model instances.

    This intentionally follows only a small list of known CMS relationship names to avoid
    surprising arbitrary ORM traversal.
    """
    if value is None or not isinstance(value, Model):
        return None

    seen = _seen or set()
    marker = id(value)
    if marker in seen:
        return None
    seen.add(marker)

    model_name = value.__class__.__name__
    if model_name == "Organization":
        return value.pk

    organization_id = getattr(value, "organization_id", None)
    if organization_id is not None:
        return organization_id

    relationship_names = (
        "site",
        "entry",
        "keyword",
        "cluster",
        "source_entry",
        "target_entry",
        "run",
        "menu",
        "content_type",
        "parent",
    )
    for name in relationship_names:
        try:
            related = getattr(value, name, None)
        except value.__class__.DoesNotExist:
            related = None
        organization_id = organization_id_for_instance(related, seen)
        if organization_id is not None:
            return organization_id
    return None


def _iter_model_values(value):
    if isinstance(value, Model):
        yield value
        return
    if isinstance(value, dict):
        for nested in value.values():
            yield from _iter_model_values(nested)
        return
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        for nested in value:
            yield from _iter_model_values(nested)


class TenantScopedViewSetMixin:
    """Scope reads to memberships and protect unsafe writes by organization role."""

    tenant_filter: str | None = None
    write_roles = None

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        allowed = allowed_organization_ids(user)
        if allowed is None:
            return queryset
        if not self.tenant_filter or not allowed:
            return queryset.none()
        return queryset.filter(**{f"{self.tenant_filter}__in": allowed})

    def get_object(self):
        instance = super().get_object()
        if self.request.method not in {"GET", "HEAD", "OPTIONS"}:
            ensure_organization_write_access(
                self.request.user,
                organization_id_for_instance(instance),
                self.write_roles,
            )
        return instance

    def validate_tenant_serializer(self, serializer, *, require_write=False) -> None:
        organization_ids = set()
        for value in serializer.validated_data.values():
            for instance in _iter_model_values(value):
                organization_id = organization_id_for_instance(instance)
                ensure_organization_access(self.request.user, organization_id)
                if organization_id is not None:
                    organization_ids.add(organization_id)

        if require_write:
            for organization_id in organization_ids:
                ensure_organization_write_access(
                    self.request.user, organization_id, self.write_roles
                )

    def perform_create(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        serializer.save()

    def perform_update(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        serializer.save()
