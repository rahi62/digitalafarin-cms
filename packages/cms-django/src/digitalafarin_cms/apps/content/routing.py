"""Canonical path contract shared by writes, previews and public reads."""
import re
import unicodedata
from urllib.parse import unquote

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_unicode_slug


def normalize_path(value, *, reserved=True):
    value = str(value or "").strip()
    if not value:
        raise ValidationError("A path is required.")
    if re.search(r"%(?:2f|5c)", value, re.I):
        raise ValidationError("Encoded path separators are not allowed.")
    try:
        value = unicodedata.normalize("NFC", unquote(value, errors="strict"))
    except UnicodeError:
        raise ValidationError("Invalid path encoding.")
    if any(ch in value for ch in "%?#\\:{}") or any(ord(ch) < 33 for ch in value):
        raise ValidationError("Path contains unsupported characters or encoding.")
    if value.startswith("//") or any(part in (".", "..") for part in value.split("/")):
        raise ValidationError("Path must be a local absolute path without traversal.")
    value = "/" + "/".join(part for part in value.split("/") if part)
    if value != "/":
        value += "/"
    if len(value) > 500:
        raise ValidationError("Path exceeds 500 characters.")
    roots = {"api", "media", "static", "_next", "cms", "admin", "digitalafarin-cms-preview", "sitemap.xml", "robots.txt", "favicon.ico"}
    roots.update(str(p).strip("/").split("/")[0] for p in getattr(settings, "DIGITALAFARIN_CMS_RESERVED_PATHS", []))
    if reserved and value.strip("/").split("/")[0].lower() in roots:
        raise ValidationError("This path is reserved for infrastructure or administration.")
    return value


def validate_type_routing(collection_path, pattern):
    if not collection_path and not pattern:
        return "", ""
    if not collection_path or not pattern:
        raise ValidationError("collection_path and entry_path_pattern must be configured together.")
    collection = normalize_path(collection_path).rstrip("/") or "/"
    if collection == "/":
        raise ValidationError("The homepage cannot be a collection path.")
    if pattern.count("{slug}") != 1:
        raise ValidationError("entry_path_pattern must contain exactly one {slug} segment.")
    if "{slug}" not in pattern.split("/"):
        raise ValidationError("{slug} must occupy an entire path segment.")
    normalized = normalize_path(pattern.replace("{slug}", "CMS-SLUG"))
    if not normalized.startswith(collection + "/"):
        raise ValidationError("Entry paths must be inside collection_path.")
    return collection, normalized.replace("CMS-SLUG", "{slug}")


def entry_path(entry, *, previous=None):
    """Only explicit routing edits move existing entries; pattern edits never bulk-move."""
    generated = entry.path_mode == "auto"
    routing_changed = previous is None or any(
        getattr(previous, key) != getattr(entry, key)
        for key in ("slug", "path_mode", "content_type_id", "path")
    )
    if generated and routing_changed:
        pattern = entry.content_type.entry_path_pattern
        if not pattern:
            raise ValidationError({"path_mode": "Automatic routing requires a content type path pattern."})
        slug = unicodedata.normalize("NFC", entry.slug)
        validate_unicode_slug(slug)
        entry.slug = slug
        path = normalize_path(pattern.replace("{slug}", slug))
    elif previous is not None and previous.path == entry.path:
        # Preserve pre-upgrade paths, including custom slash policy, until explicitly moved.
        return entry.path
    else:
        path = normalize_path(entry.path)
    collection = entry.content_type.collection_path
    if collection and path.rstrip("/") == collection.rstrip("/"):
        raise ValidationError({"path": "A collection URL cannot be used as an article URL."})
    return path


def validate_entry_route(entry, previous=None):
    from .models import ContentEntry, ContentTypeDefinition
    from digitalafarin_cms.apps.seo.models import Redirect

    path = entry_path(entry, previous=previous)
    if previous is not None and path == previous.path and entry.site_id == previous.site_id:
        return path
    if path != "/" and ContentTypeDefinition.objects.filter(site_id=entry.site_id, collection_path=path.rstrip("/")).exists():
        raise ValidationError({"path": "This URL is reserved for a collection page."})
    # Normalize legacy slash/encoding variants without rewriting their stored values.
    for pk, existing in ContentEntry.objects.filter(site_id=entry.site_id).exclude(pk=entry.pk).values_list("pk", "path"):
        try:
            normalized = normalize_path(existing, reserved=False)
        except ValidationError:
            normalized = existing
        if normalized == path:
            raise ValidationError({"path": "Another entry already owns this path."})
    for source in Redirect.objects.filter(site_id=entry.site_id, is_active=True).values_list("source_path", flat=True):
        try:
            occupied = normalize_path(source, reserved=False) == path
        except ValidationError:
            occupied = source == path
        if occupied:
            raise ValidationError({"path": "An active redirect owns this path. Review it before reusing the URL."})
    return path


def validate_collection_claim(site_id, collection, instance=None):
    from .models import ContentEntry, ContentTypeDefinition
    from digitalafarin_cms.apps.seo.models import Redirect
    if not collection or (instance and collection == instance.collection_path and site_id == instance.site_id):
        return
    if ContentTypeDefinition.objects.filter(site_id=site_id, collection_path=collection).exclude(pk=getattr(instance, "pk", None)).exists():
        raise ValidationError({"collection_path": "Another content type owns this collection URL."})
    for existing in ContentEntry.objects.filter(site_id=site_id).values_list("path", flat=True):
        try:
            match = normalize_path(existing, reserved=False).rstrip("/") == collection
        except ValidationError:
            match = False
        if match:
            raise ValidationError({"collection_path": "An existing entry owns this URL. Migrate it explicitly first."})
    if Redirect.objects.filter(site_id=site_id, source_path__in=[collection, collection + "/"], is_active=True).exists():
        raise ValidationError({"collection_path": "An active redirect owns this collection URL."})
