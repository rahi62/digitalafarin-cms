"""Recoverable CMS content deletion, with explicit publication and route safeguards."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from digitalafarin_cms.apps.sites.models import Site
from .models import ContentEntry, PublishedEntry
from .relations import find_relation_uses
from .routing import validate_entry_route
from .services import create_revision


@transaction.atomic
def move_to_trash(entry, actor):
    # Site lock coordinates route writes with ContentEntry.save() and restore.
    Site.objects.select_for_update().get(pk=entry.site_id)
    current = ContentEntry.objects.select_for_update().get(pk=entry.pk)
    if current.deleted_at is not None:
        raise ValidationError({"detail": "This entry is already in Trash."})
    refs = find_relation_uses(current)
    if refs:
        raise ValidationError({
            "detail": "Remove incoming content relations before moving this entry to Trash.",
            "referenced_by": refs,
        })
    # Restore is always a fresh draft, never an implicit public republish.
    current.status = ContentEntry.Status.ARCHIVED
    current.scheduled_at = None
    current.deleted_at = timezone.now()
    current.deleted_by = actor
    current.save(update_fields=["status", "scheduled_at", "deleted_at", "deleted_by", "updated_at"])
    PublishedEntry.objects.filter(entry=current).delete()
    create_revision(current, actor, "Moved to Trash")
    return current


@transaction.atomic
def restore_from_trash(entry, actor):
    Site.objects.select_for_update().get(pk=entry.site_id)
    current = ContentEntry.objects.select_for_update().get(pk=entry.pk)
    if current.deleted_at is None:
        raise ValidationError({"detail": "This entry is not in Trash."})
    # A path may have been claimed while the entry was in Trash; never overwrite it.
    try:
        validate_entry_route(current, previous=None)
    except DjangoValidationError as exc:
        raise ValidationError({"path": getattr(exc, "message_dict", None) or exc.messages})
    current.deleted_at = None
    current.deleted_by = None
    current.status = ContentEntry.Status.DRAFT
    current.scheduled_at = None
    current.save(update_fields=["deleted_at", "deleted_by", "status", "scheduled_at", "updated_at"])
    create_revision(current, actor, "Restored from Trash")
    return current
