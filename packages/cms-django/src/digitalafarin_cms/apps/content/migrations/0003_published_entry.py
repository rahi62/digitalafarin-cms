import uuid

from django.db import migrations, models
from django.utils import timezone
import django.db.models.deletion


def backfill_publications(apps, schema_editor):
    Entry = apps.get_model("digitalafarin_cms_content", "ContentEntry")
    Published = apps.get_model("digitalafarin_cms_content", "PublishedEntry")
    SeoMeta = apps.get_model("digitalafarin_cms_seo", "SeoMeta")
    Schema = apps.get_model("digitalafarin_cms_seo", "SchemaMarkup")
    db = schema_editor.connection.alias

    for entry in Entry.objects.using(db).filter(status="published").select_related(
        "content_type", "author"
    ).iterator():
        categories = [
            {"id": str(c.pk), "name": c.name, "slug": c.slug}
            for c in entry.categories.using(db).filter(site_id=entry.site_id)
        ]
        tags = [
            {"id": str(t.pk), "name": t.name, "slug": t.slug}
            for t in entry.tags.using(db).filter(site_id=entry.site_id)
        ]
        published_at = entry.published_at or entry.updated_at or timezone.now()
        payload = {
            "id": str(entry.pk), "site": str(entry.site_id),
            "content_type": str(entry.content_type_id),
            "content_type_slug": entry.content_type.slug,
            "author": str(entry.author_id) if entry.author_id else None,
            "author_name": entry.author.get_username() if entry.author_id else None,
            "title": entry.title, "slug": entry.slug, "path": entry.path,
            "path_mode": entry.path_mode, "excerpt": entry.excerpt,
            "blocks": entry.blocks, "custom_fields": entry.custom_fields,
            "status": "published", "is_featured": entry.is_featured,
            "parent": str(entry.parent_id) if entry.parent_id else None,
            "categories": [c["id"] for c in categories],
            "tags": [t["id"] for t in tags],
            "category_details": categories, "tag_details": tags,
            "created_at": entry.created_at.isoformat(),
            "updated_at": entry.updated_at.isoformat(),
            "published_at": published_at.isoformat(),
            "scheduled_at": None,
        }
        seo_obj = SeoMeta.objects.using(db).filter(entry_id=entry.pk).first()
        seo = {}
        if seo_obj:
            seo = {
                "id": str(seo_obj.pk), "entry": str(entry.pk),
                "entry_title": entry.title,
                "title": seo_obj.title, "description": seo_obj.description,
                "canonical_url": seo_obj.canonical_url,
                "robots_index": seo_obj.robots_index, "robots_follow": seo_obj.robots_follow,
                "og_title": seo_obj.og_title, "og_description": seo_obj.og_description,
                "og_image": seo_obj.og_image, "twitter_card": seo_obj.twitter_card,
                "focus_keyword": seo_obj.focus_keyword,
                "secondary_keywords": seo_obj.secondary_keywords,
                "seo_score": seo_obj.seo_score, "analysis": seo_obj.analysis,
                "created_at": seo_obj.created_at.isoformat(),
                "updated_at": seo_obj.updated_at.isoformat(),
            }
        schemas = [
            {
                "id": str(item.pk), "entry": str(entry.pk), "entry_title": entry.title,
                "schema_type": item.schema_type, "data": item.data,
                "is_active": True, "created_at": item.created_at.isoformat(),
                "updated_at": item.updated_at.isoformat(),
            }
            for item in Schema.objects.using(db).filter(entry_id=entry.pk, is_active=True)
        ]
        Published.objects.using(db).create(
            entry_id=entry.pk, site_id=entry.site_id, content_type_id=entry.content_type_id,
            path=entry.path, title=entry.title, excerpt=entry.excerpt,
            published_at=published_at, payload=payload, seo=seo, schemas=schemas,
            category_slugs=[c["slug"] for c in categories],
            tag_slugs=[t["slug"] for t in tags],
            is_indexable=seo.get("robots_index", True),
        )


class Migration(migrations.Migration):
    dependencies = [
        ("digitalafarin_cms_content", "0002_contententry_path_mode_and_more"),
        ("digitalafarin_cms_seo", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PublishedEntry",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("path", models.CharField(max_length=500)),
                ("title", models.CharField(max_length=255)),
                ("excerpt", models.TextField(blank=True)),
                ("published_at", models.DateTimeField()),
                ("payload", models.JSONField(default=dict)),
                ("seo", models.JSONField(default=dict, blank=True)),
                ("schemas", models.JSONField(default=list, blank=True)),
                ("category_slugs", models.JSONField(default=list, blank=True)),
                ("tag_slugs", models.JSONField(default=list, blank=True)),
                ("is_indexable", models.BooleanField(default=True)),
                ("entry", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE,
                                             related_name="published_copy", to="digitalafarin_cms_content.contententry")),
                ("site", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                           related_name="published_entries", to="digitalafarin_cms_sites.site")),
                ("content_type", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,
                                                  related_name="published_entries", to="digitalafarin_cms_content.contenttypedefinition")),
            ],
            options={
                "constraints": [models.UniqueConstraint(fields=["site", "path"], name="unique_published_site_path")],
                "indexes": [models.Index(fields=["site", "-published_at"], name="cms_published_site_time")],
            },
        ),
        migrations.RunPython(backfill_publications, migrations.RunPython.noop),
    ]
