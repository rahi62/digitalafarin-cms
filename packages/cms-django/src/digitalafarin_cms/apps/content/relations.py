"""Reference-aware deletion guards for explicit JSON content relations."""
from .models import ContentEntry, PublishedEntry, ContentTypeDefinition


def _has_target(fields, values, *, target_id, target_slug):
    if not isinstance(values, dict):
        return False
    for field in fields:
        key = field.get("key")
        kind = field.get("type", "text")
        data = values.get(key)
        if kind == "relation" and field.get("target_content_type") == target_slug:
            if str(data) == str(target_id):
                return True
        elif kind == "group" and _has_target(
            field.get("fields", []), data, target_id=target_id, target_slug=target_slug
        ):
            return True
        elif kind == "repeater" and isinstance(data, list):
            if any(_has_target(field.get("fields", []), item, target_id=target_id, target_slug=target_slug)
                   for item in data):
                return True
    return False


def find_relation_uses(target, *, limit=5):
    """Find references in editorial *and* frozen published records.

    Conservative scan: correctness precedes indexing. A later migration will
    maintain a materialized reference index for large content installations.
    """
    uses = []
    source_types = ContentTypeDefinition.objects.filter(site_id=target.site_id).only("id", "schema")
    for source_type in source_types.iterator(chunk_size=100):
        fields = (source_type.schema or {}).get("fields", [])
        if not fields:
            continue
        for source in ContentEntry.objects.filter(content_type_id=source_type.pk).only(
            "pk", "title", "custom_fields"
        ).iterator(chunk_size=200):
            if source.pk == target.pk:
                continue
            if _has_target(fields, source.custom_fields, target_id=target.pk,
                           target_slug=target.content_type.slug):
                uses.append({"entry_id": str(source.pk), "title": source.title, "version": "draft"})
                if len(uses) >= limit:
                    return uses
        for published in PublishedEntry.objects.filter(content_type_id=source_type.pk).only(
            "entry_id", "title", "payload"
        ).iterator(chunk_size=200):
            if published.entry_id == target.pk:
                continue
            if _has_target(fields, published.payload.get("custom_fields", {}),
                           target_id=target.pk, target_slug=target.content_type.slug):
                uses.append({"entry_id": str(published.entry_id), "title": published.title, "version": "published"})
                if len(uses) >= limit:
                    return uses
    return uses
