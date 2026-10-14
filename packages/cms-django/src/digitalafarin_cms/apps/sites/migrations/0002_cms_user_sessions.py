from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("digitalafarin_cms_sites", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CmsUserSession",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4,
                                        editable=False, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("refresh_expires_at", models.DateTimeField()),
                ("last_seen_at", models.DateTimeField(null=True, blank=True)),
                ("revoked_at", models.DateTimeField(null=True, blank=True)),
                ("user_agent", models.CharField(max_length=255, blank=True)),
                ("user", models.ForeignKey(to=settings.AUTH_USER_MODEL,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="cms_login_sessions")),
            ],
            options={"indexes": [
                models.Index(fields=["user", "revoked_at", "refresh_expires_at"],
                             name="cms_user_session_lookup"),
            ]},
        ),
    ]
