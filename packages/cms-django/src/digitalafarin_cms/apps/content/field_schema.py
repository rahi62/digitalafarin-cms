"""Typed Custom Field schemas for Django CMS, with tenant-safe relations.

The schema is JSON so existing data and SDK contracts stay stable. Unknown
historical data keys are preserved while declared field values are validated.
"""
import re
import uuid
from datetime import date, datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator, validate_email
from rest_framework import serializers

from .models import ContentEntry

KEY_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
SIMPLE_TYPES = {
    "text", "textarea", "number", "boolean", "date", "datetime",
    "url", "email", "select", "media", "json",
}
COMPOUND_TYPES = {"group", "repeater", "relation", "gallery"}
FIELD_TYPES = SIMPLE_TYPES | COMPOUND_TYPES
MAX_FIELDS = 50
MAX_DEPTH = 3
MAX_ITEMS = 50


def validate_schema_fields(fields, depth=0):
    if not isinstance(fields, list) or len(fields) > MAX_FIELDS:
        raise serializers.ValidationError("fields must be an array of at most 50 fields")
    if depth > MAX_DEPTH:
        raise serializers.ValidationError("Nested fields are too deep")
    seen = set()
    for pos, field in enumerate(fields):
        if not isinstance(field, dict):
            raise serializers.ValidationError(f"Field {pos + 1} must be an object")
        key = field.get("key")
        kind = field.get("type", "text")
        if not isinstance(key, str) or not KEY_PATTERN.fullmatch(key):
            raise serializers.ValidationError(f"Field {pos + 1} has an invalid key")
        if key in seen:
            raise serializers.ValidationError(f"Duplicate field key: {key}")
        seen.add(key)
        if kind not in FIELD_TYPES:
            raise serializers.ValidationError(f"Unsupported field type: {kind}")
        if "required" in field and not isinstance(field["required"], bool):
            raise serializers.ValidationError(f"{key}: required must be boolean")
        if kind == "select":
            options = field.get("options", [])
            if not isinstance(options, list) or len(options) > 100:
                raise serializers.ValidationError(f"{key}: options must be an array of at most 100 choices")
            option_keys = []
            for option in options:
                value = option if isinstance(option, str) else option.get("value") if isinstance(option, dict) else None
                if not isinstance(value, str) or not value:
                    raise serializers.ValidationError(f"{key}: each option needs a non-empty string value")
                option_keys.append(value)
            if len(set(option_keys)) != len(option_keys):
                raise serializers.ValidationError(f"{key}: duplicate select options")
        if kind in {"group", "repeater"}:
            if depth >= MAX_DEPTH:
                raise serializers.ValidationError(f"{key}: maximum nesting depth exceeded")
            validate_schema_fields(field.get("fields", []), depth + 1)
        if kind in {"repeater", "gallery"}:
            min_items = field.get("min_items", 0)
            max_items = field.get("max_items", MAX_ITEMS)
            if (type(min_items) is not int or type(max_items) is not int
                    or not 0 <= min_items <= max_items <= MAX_ITEMS):
                raise serializers.ValidationError(f"{key}: min_items/max_items must be between 0 and 50")
        if kind == "relation":
            slug = field.get("target_content_type")
            if not isinstance(slug, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", slug):
                raise serializers.ValidationError(f"{key}: target_content_type slug is required")


def validate_field_values(fields, values, site, depth=0):
    if not isinstance(values, dict):
        raise serializers.ValidationError({"custom_fields": "Expected an object."})
    errors = {}
    for field in fields:
        key = field["key"]
        value = values.get(key)
        kind = field.get("type", "text")
        required = bool(field.get("required"))
        if value is None or value == "" or (kind in {"repeater", "gallery"} and value == []):
            if required or (kind in {"repeater", "gallery"} and field.get("min_items", 0) > 0):
                errors[key] = "Required field or minimum items missing."
            continue
        if kind in {"text", "textarea", "media"}:
            if not isinstance(value, str):
                errors[key] = "Expected text."
        elif kind == "number":
            if type(value) not in (int, float):
                errors[key] = "Expected a number."
        elif kind == "boolean":
            if not isinstance(value, bool):
                errors[key] = "Expected true or false."
        elif kind in {"date", "datetime"}:
            try:
                if not isinstance(value, str):
                    raise ValueError
                (date.fromisoformat if kind == "date" else datetime.fromisoformat)(value.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                errors[key] = "Invalid ISO date or datetime."
        elif kind in {"email", "url"}:
            try:
                if not isinstance(value, str):
                    raise ValueError
                (validate_email if kind == "email" else URLValidator())(value)
            except (DjangoValidationError, ValueError):
                errors[key] = "Invalid email or URL."
        elif kind == "select":
            allowed = {
                option if isinstance(option, str) else option["value"]
                for option in field.get("options", [])
            }
            if value not in allowed if isinstance(value, str) else True:
                errors[key] = "Select a configured option."
        elif kind == "group":
            if not isinstance(value, dict):
                errors[key] = "Expected a group object."
            else:
                try:
                    validate_field_values(field.get("fields", []), value, site, depth + 1)
                except serializers.ValidationError as exc:
                    errors[key] = exc.detail
        elif kind == "repeater":
            if not isinstance(value, list):
                errors[key] = "Expected a list of objects."
            elif not field.get("min_items", 0) <= len(value) <= field.get("max_items", MAX_ITEMS):
                errors[key] = "Item count exceeds the configured limits."
            else:
                item_errors = {}
                for pos, row in enumerate(value):
                    try:
                        validate_field_values(field.get("fields", []), row, site, depth + 1)
                    except serializers.ValidationError as exc:
                        item_errors[str(pos)] = exc.detail
                if item_errors:
                    errors[key] = item_errors
        elif kind == "gallery":
            if (not isinstance(value, list)
                or not field.get("min_items", 0) <= len(value) <= field.get("max_items", MAX_ITEMS)
                or any(not isinstance(item, str) or not item for item in value)):
                errors[key] = "Expected a bounded list of media URLs."
        elif kind == "relation":
            try:
                identifier = uuid.UUID(str(value))
            except (ValueError, TypeError, AttributeError):
                errors[key] = "Choose a content entry."
            else:
                if not site or not ContentEntry.objects.filter(
                    pk=identifier, site_id=site.pk,
                    content_type__slug=field["target_content_type"],
                ).exists():
                    errors[key] = "Related entry must belong to this site and content type."
    if errors:
        raise serializers.ValidationError(errors)


def find_breaking_schema_changes(old_fields, next_fields, prefix=""):
    """Return risky schema edits that require an explicit content migration."""
    errors = []
    next_by_key = {item["key"]: item for item in next_fields}
    old_by_key = {item["key"]: item for item in old_fields}
    for key, old in old_by_key.items():
        path = f"{prefix}{key}"
        new = next_by_key.get(key)
        if new is None:
            errors.append(f"{path}: removing a field needs a migration")
        elif old.get("type", "text") != new.get("type", "text"):
            errors.append(f"{path}: changing a field type needs a migration")
        elif old.get("type") == "relation" and old.get("target_content_type") != new.get("target_content_type"):
            errors.append(f"{path}: changing relationship target needs a migration")
        elif old.get("type") in {"group", "repeater"}:
            errors.extend(find_breaking_schema_changes(
                old.get("fields", []), new.get("fields", []), prefix=f"{path}.",
            ))
    for key, new in next_by_key.items():
        if key not in old_by_key and new.get("required") and new.get("default") in (None, ""):
            errors.append(f"{prefix}{key}: a new required field needs a default or migration")
    return errors
