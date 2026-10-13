"""Editor revisions: preserve meaningful checkpoints without per-keystroke churn."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import ContentEntry, ContentRevision


def _iso(value):
    return value.isoformat() if value is not None else None


def _snapshot(entry):
    return {
        "title": entry.title,
        "slug": entry.slug,
        "path": entry.path,
        "path_mode": entry.path_mode,
        "excerpt": entry.excerpt,
        "blocks": entry.blocks,
        "custom_fields": entry.custom_fields,
        "status": entry.status,
        "parent_id": str(entry.parent_id) if entry.parent_id else None,
        "category_ids": [str(value) for value in entry.categories.values_list("id", flat=True)],
        "tag_ids": [str(value) for value in entry.tags.values_list("id", flat=True)],
        "is_featured": entry.is_featured,
        "scheduled_at": _iso(entry.scheduled_at),
        "published_at": _iso(entry.published_at),
    }


@transaction.atomic
def create_revision(entry, user=None, note="", *, coalesce_autosave=False):
    """Serialize revision numbers and cap autosave snapshots to five-minute groups.

    A manual save, publish, workflow transition or restore always creates a new
    immutable checkpoint. Autosave never overwrites those checkpoints.
    """
    ContentEntry.objects.select_for_update().get(pk=entry.pk)
    latest = entry.revisions.select_for_update().order_by("-number").first()
    snapshot = _snapshot(entry)
    if coalesce_autosave and latest is not None:
        same_author = latest.created_by_id == getattr(user, "pk", None)
        recent = latest.created_at >= timezone.now() - timedelta(minutes=5)
        if latest.note == "Autosaved" and same_author and recent:
            latest.snapshot = snapshot
            latest.save(update_fields=["snapshot", "updated_at"])
            return latest

    number = (latest.number + 1) if latest else 1
    return ContentRevision.objects.create(
        entry=entry,
        number=number,
        snapshot=snapshot,
        created_by=user,
        note="Autosaved" if coalesce_autosave else note,
    )
