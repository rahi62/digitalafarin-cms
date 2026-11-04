"""Explicit publication boundary between a mutable editorial entry and public content."""

from copy import deepcopy
import json

from django.core.serializers.json import DjangoJSONEncoder

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from digitalafarin_cms.apps.seo.models import Redirect, SchemaMarkup, SeoMeta
from digitalafarin_cms.apps.seo.serializers import SchemaMarkupSerializer, SeoMetaSerializer
from digitalafarin_cms.apps.integrations import webhooks
from .models import PublishedEntry, PublishedEntryTerm
from .routing import normalize_path

logger = logging.getLogger("digitalafarin_cms.content")


def capture_publication(entry):
    """Capture plain JSON from the working copy without mutating CMS objects."""
    category_records = list(entry.categories.filter(site_id=entry.site_id).values("id", "name", "slug"))
    tag_records = list(entry.tags.filter(site_id=entry.site_id).values("id", "name", "slug"))
    categories = [{"id": str(item["id"]), "name": item["name"], "slug": item["slug"]} for item in category_records]
    tags = [{"id": str(item["id"]), "name": item["name"], "slug": item["slug"]} for item in tag_records]

    payload = {
        "id": str(entry.id), "site": str(entry.site_id),
        "content_type": str(entry.content_type_id),
        "content_type_slug": entry.content_type.slug,
        "author": str(entry.author_id) if entry.author_id else None,
        "author_name": entry.author.get_username() if entry.author_id else None,
        "title": entry.title, "slug": entry.slug, "path": entry.path,
        "path_mode": entry.path_mode,
        "excerpt": entry.excerpt, "blocks": deepcopy(entry.blocks),
        "custom_fields": deepcopy(entry.custom_fields),
        "status": "published", "is_featured": entry.is_featured,
        "parent": str(entry.parent_id) if entry.parent_id else None,
        "categories": [row["id"] for row in categories],
        "tags": [row["id"] for row in tags],
        "category_details": categories, "tag_details": tags,
        "created_at": entry.created_at.isoformat(),
        "updated_at": entry.updated_at.isoformat(),
        "published_at": entry.published_at.isoformat() if entry.published_at else None,
        "scheduled_at": None,
    }
    seo_obj = SeoMeta.objects.filter(entry=entry).first()
    seo = json.loads(json.dumps(dict(SeoMetaSerializer(seo_obj).data), cls=DjangoJSONEncoder)) if seo_obj else {}
    if seo_obj:
        seo["og_image"] = seo_obj.og_image
    schemas = json.loads(json.dumps(list(SchemaMarkupSerializer(
        SchemaMarkup.objects.filter(entry=entry, is_active=True), many=True,
    ).data), cls=DjangoJSONEncoder))
    return payload, seo, schemas, categories, tags


def content_event_data(entry, paths):
    collection = (entry.content_type.collection_path or "").rstrip("/")
    ordered = list(dict.fromkeys(paths + ([collection + "/"] if collection else [])))
    return {
        "entry_id": str(entry.pk), "content_type": entry.content_type.slug,
        "path": paths[0], "paths": ordered,
    }


def unpublish_snapshot(entry, *, event="content.unpublished"):
    """Remove the public projection and tell receivers which URL went away."""
    published = PublishedEntry.objects.filter(entry=entry).first()
    if published is None:
        return False
    path = published.path
    published.delete()
    webhooks.emit_event(entry.site, event, content_event_data(entry, [path]))
    logger.info("content %s entry=%s site=%s", event.split(".")[1], entry.pk, entry.site_id)
    return True


def canonical_path(path):
    """Indexed lookup key for a published path (never raises)."""
    try:
        return normalize_path(path, reserved=False)
    except DjangoValidationError:
        return path


def sync_terms(published, categories, tags):
    """Replace the indexed category/tag rows for one published entry."""
    PublishedEntryTerm.objects.filter(published_entry=published).delete()
    rows = [
        PublishedEntryTerm(site_id=published.site_id, published_entry=published,
                           kind=PublishedEntryTerm.Kind.CATEGORY, slug=slug)
        for slug in dict.fromkeys(row["slug"] for row in categories)
    ] + [
        PublishedEntryTerm(site_id=published.site_id, published_entry=published,
                           kind=PublishedEntryTerm.Kind.TAG, slug=slug)
        for slug in dict.fromkeys(row["slug"] for row in tags)
    ]
    PublishedEntryTerm.objects.bulk_create(rows)


@transaction.atomic
def publish_snapshot(entry):
    """Commit the full public projection and deferred redirect in one transaction.

    Only call from an authorized workflow or initial legacy published creation.
    """
    from .views import frontend_base_for
    # Serializes concurrent publication with route ownership on this site.
    entry.__class__.objects.select_for_update().get(pk=entry.pk)
    previous = PublishedEntry.objects.select_for_update().filter(entry=entry).first()
    old_path = previous.path if previous else None
    new_path = entry.path

    if old_path and old_path != new_path:
        base = frontend_base_for(entry.site)
        SeoMeta.objects.filter(entry=entry, canonical_url=base + old_path).update(
            canonical_url=base + new_path,
        )
    payload, seo, schemas, categories, tags = capture_publication(entry)

    try:
        published, _ = PublishedEntry.objects.update_or_create(
            entry=entry,
            defaults={
                "site": entry.site,
                "content_type": entry.content_type,
                "path": new_path,
                "normalized_path": canonical_path(new_path),
                "last_published_at": timezone.now(),
                "title": entry.title,
                "excerpt": entry.excerpt,
                "published_at": entry.published_at,
                "payload": payload,
                "seo": seo,
                "schemas": schemas,
                "category_slugs": [row["slug"] for row in categories],
                "tag_slugs": [row["slug"] for row in tags],
                "is_indexable": bool(seo.get("robots_index", True)),
            },
        )
    except Exception as exc:
        from django.db import IntegrityError
        if isinstance(exc, IntegrityError):
            raise ValidationError({"path": "A different published entry owns this route."}) from exc
        raise

    sync_terms(published, categories, tags)

    suppressed = webhooks.suppress_redirect_events.set(True)
    try:
        if old_path and old_path != new_path:
            Redirect.objects.filter(
                site_id=entry.site_id, destination_path=old_path, is_active=True,
            ).update(destination_path=new_path)
            Redirect.objects.update_or_create(
                site_id=entry.site_id, source_path=old_path,
                defaults={"destination_path": new_path, "redirect_type": "301", "is_active": True},
            )
    finally:
        webhooks.suppress_redirect_events.reset(suppressed)
    # Exactly one event per publish; it names every URL whose cached output may be stale.
    webhooks.emit_event(entry.site, "content.published", content_event_data(
        entry, [new_path] + ([old_path] if old_path and old_path != new_path else []),
    ))
    logger.info("content published entry=%s site=%s", entry.pk, entry.site_id)
    return published
