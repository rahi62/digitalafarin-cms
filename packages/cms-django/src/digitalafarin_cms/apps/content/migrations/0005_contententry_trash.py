from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("digitalafarin_cms_content", "0004_singleton_types"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="contententry",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True, db_index=True),
        ),
        migrations.AddField(
            model_name="contententry",
            name="deleted_by",
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL, blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="cms_trashed_entries",
            ),
        ),
    ]
