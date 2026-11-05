"""Bounded, reversible-in-principle custom-field renaming with mandatory dry run.

This operation intentionally excludes publicly published entry types: changing
the schema while public snapshots hold the old keys requires a coordinated
dual-schema/republish rollout, not a silent data mutation.
"""
import hashlib
import json
import re
from copy import deepcopy

from django.core import signing
from django.db import transaction
from rest_framework.exceptions import ValidationError

from digitalafarin_cms.apps.sites.models import Site
from .field_schema import KEY_PATTERN, validate_field_values, validate_schema_fields
from .models import ContentEntry, ContentSchemaMigration, ContentTypeDefinition, PublishedEntry
from .services import create_revision

MAX_INTERACTIVE_ENTRIES = 200
TOKEN_MAX_AGE = 15 * 60
SIGNING_SALT = "digitalafarin-cms-schema-rename-v1"


def _digest(content_type, entries):
    content = {
        "type": str(content_type.pk), "schema": content_type.schema,
        "rows": [
            {"id": str(entry.pk), "custom_fields": entry.custom_fields}
            for entry in entries
        ],
    }
    raw = json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _prepare(content_type, source, destination, *, lock=False):
    if not isinstance(source, str) or not isinstance(destination, str):
        raise ValidationError({"keys": "Both field keys must be strings."})
    if not KEY_PATTERN.fullmatch(source) or not KEY_PATTERN.fullmatch(destination) or source == destination:
        raise ValidationError({"keys": "Enter different valid field keys."})
    fields = (content_type.schema or {}).get("fields", [])
    if not any(field["key"] == source for field in fields):
        raise ValidationError({"source_key": "This field does not exist in the current schema."})
    if any(field["key"] == destination for field in fields):
        raise ValidationError({"destination_key": "A field with the new key already exists."})

    query = ContentEntry.objects.filter(content_type_id=content_type.pk).order_by("pk")
    count = query.count()
    if count > MAX_INTERACTIVE_ENTRIES:
        raise ValidationError({"detail": "Too many entries for an interactive migration. Use a reviewed offline migration.", "count": count})
    entries = list(query.select_for_update() if lock else query)

    future_schema = deepcopy(content_type.schema or {})
    for item in future_schema.get("fields", []):
        if item["key"] == source:
            item["key"] = destination
    validate_schema_fields(future_schema.get("fields", []))

    issues = []
    new_values = []
    modified = 0
    for entry in entries:
        current = entry.custom_fields or {}
        if not isinstance(current, dict):
            issues.append(f"{entry.pk}: existing custom_fields are not an object")
            continue
        if destination in current:
            issues.append(f"{entry.pk}: destination key already contains data")
            continue
        updated = dict(current)
        if source in updated:
            updated[destination] = updated.pop(source)
            modified += 1
        try:
            validate_field_values(future_schema.get("fields", []), updated, content_type.site)
        except ValidationError:
            issues.append(f"{entry.pk}: existing values are incompatible with the next schema")
        new_values.append((entry, updated))
        if len(issues) >= 10:
            break

    live_count = PublishedEntry.objects.filter(content_type_id=content_type.pk).count()
    if live_count:
        issues.append("Published entries exist: coordinate a versioned schema/republish migration instead.")
    return {
        "content_type": content_type,
        "from": source, "to": destination,
        "schema": future_schema,
        "entries": new_values,
        "entry_count": count,
        "modified_entries": modified,
        "live_count": live_count,
        "issues": issues,
        "digest": _digest(content_type, entries),
    }


def preview_field_rename(content_type, source, destination):
    plan = _prepare(content_type, source, destination)
    permitted = not plan["issues"]
    token = signing.dumps({
        "content_type": str(content_type.pk),
        "source_key": source,
        "destination_key": destination,
        "digest": plan["digest"],
    }, salt=SIGNING_SALT) if permitted else None
    return {
        "can_execute": permitted,
        "total_entries": plan["entry_count"],
        "changed_entries": plan["modified_entries"],
        "live_entries": plan["live_count"],
        "issues": plan["issues"],
        "preview_token": token,
        "new_schema": plan["schema"],
        "note": "Only an explicit confirmed operation updates the draft schema and working-copy values.",
    }


@transaction.atomic
def execute_field_rename(content_type, source, destination, preview_token, actor):
    if not isinstance(preview_token, str) or not preview_token:
        raise ValidationError({"preview_token": "First generate a migration preview."})
    try:
        claims = signing.loads(preview_token, salt=SIGNING_SALT, max_age=TOKEN_MAX_AGE)
    except signing.BadSignature:
        raise ValidationError({"preview_token": "Invalid or expired preview; run the preview again."})
    if (claims.get("content_type") != str(content_type.pk) or
        claims.get("source_key") != source or claims.get("destination_key") != destination):
        raise ValidationError({"preview_token": "This token belongs to a different migration."})

    # Content writes acquire the same site lock, serializing validation and writes.
    Site.objects.select_for_update().get(pk=content_type.site_id)
    content_type = ContentTypeDefinition.objects.select_for_update().select_related("site").get(pk=content_type.pk)
    plan = _prepare(content_type, source, destination, lock=True)
    if claims.get("digest") != plan["digest"]:
        raise ValidationError({"preview_token": "Content or schema changed after preview; run it again."})
    if plan["issues"]:
        raise ValidationError({"issues": plan["issues"]})

    old_schema = deepcopy(content_type.schema)
    content_type.schema = plan["schema"]
    content_type.save(update_fields=["schema", "updated_at"])
    for entry, updated in plan["entries"]:
        if entry.custom_fields != updated:
            entry.custom_fields = updated
            entry.save(update_fields=["custom_fields", "updated_at"])
            create_revision(entry, actor, f"Schema migration: {source} -> {destination}")
    audit = ContentSchemaMigration.objects.create(
        content_type=content_type,
        operation="rename_root_field",
        source_key=source, destination_key=destination,
        before_schema=old_schema, after_schema=plan["schema"],
        affected_entries=plan["modified_entries"], executed_by=actor,
    )
    return {
        "migration_id": str(audit.pk),
        "total_entries": plan["entry_count"],
        "changed_entries": plan["modified_entries"],
        "message": "Renamed field and migrated editorial values. Public content was not modified.",
    }
