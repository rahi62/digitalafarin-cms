from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("digitalafarin_cms_content", "0007_component_binding_drafts"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="componentbindingdraft", name="approved_version",
            field=models.PositiveIntegerField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="componentbindingdraft", name="approved_checksum",
            field=models.CharField(max_length=64, blank=True),
        ),
        migrations.AddField(
            model_name="componentbindingdraft", name="approved_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="componentbindingdraft", name="approved_by",
            field=models.ForeignKey(to=settings.AUTH_USER_MODEL, null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="approved_cms_component_bindings"),
        ),
        migrations.CreateModel(
            name="ComponentBindingApprovalEvent",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4,
                                        editable=False, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("action", models.CharField(max_length=16,
                    choices=[("approve", "Approve"), ("rollback", "Rollback"), ("revoke", "Revoke")])),
                ("from_version", models.PositiveIntegerField(null=True, blank=True)),
                ("to_version", models.PositiveIntegerField()),
                ("checksum", models.CharField(max_length=64)),
                ("reason", models.CharField(max_length=500, blank=True)),
                ("draft", models.ForeignKey(
                    to="digitalafarin_cms_content.componentbindingdraft",
                    on_delete=django.db.models.deletion.PROTECT, related_name="approval_events")),
                ("approved_by", models.ForeignKey(
                    to=settings.AUTH_USER_MODEL, null=True, blank=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="cms_component_approval_events")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
