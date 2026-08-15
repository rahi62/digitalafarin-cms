from .models import ContentRevision


def _iso(value):
    return value.isoformat() if value is not None else None


def create_revision(entry, user=None, note=""):
    latest = entry.revisions.first()
    number = (latest.number + 1) if latest else 1
    snapshot = {
        "title": entry.title,
        "slug": entry.slug,
        "path": entry.path,
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
    return ContentRevision.objects.create(
        entry=entry,
        number=number,
        snapshot=snapshot,
        created_by=user,
        note=note,
    )
