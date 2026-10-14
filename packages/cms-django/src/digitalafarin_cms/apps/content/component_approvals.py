"""Approval of host-owned component configuration; no runtime activation or deployment."""
import hashlib
import json

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .component_bindings import StaleComponentBinding, validate_component_slots
from .models import ComponentBindingDraft, ComponentBindingRevision, ComponentBindingApprovalEvent


def manifest_digest(slots):
    canonical = json.dumps(
        slots, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        allow_nan=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _revision(draft, version):
    try:
        revision = ComponentBindingRevision.objects.get(draft_id=draft.pk, version=version)
    except ComponentBindingRevision.DoesNotExist:
        raise ValidationError({"target_version": "This version does not exist."})
    validate_component_slots(revision.slots)
    return revision


def _expected(request_data, name):
    if name not in request_data:
        raise ValidationError({name: "Supply the version you last observed (null before first approval)."})
    value = request_data[name]
    if value is not None and (type(value) is not int or value < 1):
        raise ValidationError({name: "Expected an integer version or null."})
    return value


def approval_state(draft, *, include_history=False):
    result = {
        "draft_id": str(draft.pk),
        "site": str(draft.site_id),
        "host_key": draft.host_key,
        "draft_version": draft.version,
        "approved_version": draft.approved_version,
        "approved_checksum": draft.approved_checksum or None,
        "approved_at": draft.approved_at.isoformat() if draft.approved_at else None,
        "approved_by": str(draft.approved_by_id) if draft.approved_by_id else None,
        "has_unapproved_changes": (
            draft.approved_version is not None and draft.approved_version != draft.version
        ),
        "runtime_status": "unverified",
        "runtime_note": "CMS approval does not install, deploy or activate a Next.js host manifest.",
    }
    if include_history:
        result["events"] = [
            {
                "id": str(event.pk),
                "action": event.action,
                "from_version": event.from_version,
                "to_version": event.to_version,
                "checksum": event.checksum,
                "reason": event.reason,
                "approved_by": str(event.approved_by_id) if event.approved_by_id else None,
                "created_at": event.created_at.isoformat(),
            } for event in draft.approval_events.order_by("-created_at", "-pk")[:30]
        ]
    return result


@transaction.atomic
def change_approval(draft, actor, *, action, data):
    if action not in {"approve", "rollback"} or data.get("confirm") is not True:
        raise ValidationError({"confirm": "A true confirmation and valid action are required."})
    expected = _expected(data, "expected_approved_version")
    draft_expected = _expected(data, "expected_draft_version")
    target = data.get("target_version")
    if type(target) is not int or target < 1:
        raise ValidationError({"target_version": "Choose a positive integer version."})
    reason = data.get("reason", "")
    if not isinstance(reason, str) or len(reason) > 500:
        raise ValidationError({"reason": "Reason must contain at most 500 characters."})
    if action == "rollback" and not reason.strip():
        raise ValidationError({"reason": "Provide a reason for rollback."})

    locked = ComponentBindingDraft.objects.select_for_update().get(pk=draft.pk)
    if expected != locked.approved_version or draft_expected != locked.version:
        raise StaleComponentBinding()
    if target == locked.approved_version:
        raise ValidationError({"target_version": "This version is already approved."})
    if action == "approve":
        if target != locked.version:
            raise ValidationError({"target_version": "Only the current working revision can be approved."})
    else:
        if locked.approved_version is None:
            raise ValidationError({"target_version": "No approval is available to roll back."})
        if not locked.approval_events.filter(to_version=target).exists():
            raise ValidationError({"target_version": "Rollback requires a previously approved revision."})

    revision = _revision(locked, target)
    if not revision.slots:
        raise ValidationError({"target_version": "An empty host registry cannot be approved."})
    checksum = manifest_digest(revision.slots)
    previous = locked.approved_version

    locked.approved_version = target
    locked.approved_checksum = checksum
    locked.approved_at = timezone.now()
    locked.approved_by = actor
    locked.save(update_fields=[
        "approved_version", "approved_checksum", "approved_at", "approved_by", "updated_at",
    ])
    ComponentBindingApprovalEvent.objects.create(
        draft=locked, action=action, from_version=previous, to_version=target,
        checksum=checksum, reason=reason, approved_by=actor,
    )
    return approval_state(locked, include_history=True)


def get_approved_manifest(draft):
    if draft.approved_version is None:
        raise ValidationError({"detail": "This host has no approved component configuration."})
    revision = _revision(draft, draft.approved_version)
    checksum = manifest_digest(revision.slots)
    if checksum != draft.approved_checksum:
        raise ValidationError({"detail": "Approval checksum mismatch: manual review required."})
    return {
        "format_version": 1,
        "site": str(draft.site_id),
        "host_key": draft.host_key,
        "approved_version": draft.approved_version,
        "sha256": checksum,
        "slots": revision.slots,
        "runtime_status": "unverified",
    }
