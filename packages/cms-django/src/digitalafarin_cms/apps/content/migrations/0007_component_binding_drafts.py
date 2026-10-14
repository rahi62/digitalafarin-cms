from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("digitalafarin_cms_content", "0006_content_schema_migration_audit"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ComponentBindingDraft",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("host_key", models.SlugField(max_length=80)),
                ("slots", models.JSONField(default=list)),
                ("version", models.PositiveIntegerField(default=1)),
                ("site", models.ForeignKey(to="digitalafarin_cms_sites.site", on_delete=django.db.models.deletion.CASCADE, related_name="cms_component_drafts")),
                ("created_by", models.ForeignKey(to=settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_cms_component_drafts")),
                ("updated_by", models.ForeignKey(to=settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="updated_cms_component_drafts")),
            ],
            options={"constraints": [
                models.UniqueConstraint(fields=["site", "host_key"], name="unique_cms_component_site_host"),
            ]},
        ),
        migrations.CreateModel(
            name="ComponentBindingRevision",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("version", models.PositiveIntegerField()),
                ("slots", models.JSONField(default=list)),
                ("draft", models.ForeignKey(to="digitalafarin_cms_content.componentbindingdraft", on_delete=django.db.models.deletion.CASCADE, related_name="revisions")),
                ("created_by", models.ForeignKey(to=settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name="cms_component_revisions")),
            ],
            options={"constraints": [
                models.UniqueConstraint(fields=["draft", "version"], name="unique_cms_component_revision"),
            ]},
        ),
    ]
