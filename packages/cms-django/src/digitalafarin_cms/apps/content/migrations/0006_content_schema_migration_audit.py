from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("digitalafarin_cms_content", "0005_contententry_trash"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ContentSchemaMigration",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("operation", models.CharField(max_length=50)),
                ("source_key", models.CharField(max_length=120)),
                ("destination_key", models.CharField(max_length=120)),
                ("before_schema", models.JSONField(default=dict)),
                ("after_schema", models.JSONField(default=dict)),
                ("affected_entries", models.PositiveIntegerField(default=0)),
                ("content_type", models.ForeignKey(
                    to="digitalafarin_cms_content.contenttypedefinition",
                    on_delete=django.db.models.deletion.PROTECT, related_name="schema_migrations",
                )),
                ("executed_by", models.ForeignKey(
                    to=settings.AUTH_USER_MODEL,
                    on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True,
                )),
            ],
        ),
    ]
