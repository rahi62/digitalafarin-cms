"""Explicit publication boundary between a mutable editorial entry and public content."""

from copy import deepcopy

from django.db import transaction
from rest_framework.exceptions import ValidationError

from digitalafarin_cms.apps.seo.models import Redirect, SchemaMarkup, SeoMeta
from digitalafarin_cms.apps.seo.serializers import SchemaMarkupSerializer, SeoMetaSerializer
from .models import PublishedEntry


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
    seo = dict(SeoMetaSerializer(seo_obj).data) if seo_obj else {}
    if seo_obj:
        seo["og_image"] = seo_obj.og_image
    schemas = list(SchemaMarkupSerializer(
        SchemaMarkup.objects.filter(entry=entry, is_active=True), many=True,
    ).data)
    return payload, seo, schemas, categories, tags


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

    if old_path and old_path != new_path:
        Redirect.objects.filter(
            site_id=entry.site_id, destination_path=old_path, is_active=True,
        ).update(destination_path=new_path)
        Redirect.objects.update_or_create(
            site_id=entry.site_id, source_path=old_path,
            defaults={"destination_path": new_path, "redirect_type": "301", "is_active": True},
        )
    return published
