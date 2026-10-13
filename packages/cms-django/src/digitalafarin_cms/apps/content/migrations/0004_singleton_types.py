# Additive singleton semantics: existing content types remain collections.
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("digitalafarin_cms_content", "0003_published_entry")]

    operations = [
        migrations.AddField(
            model_name="contenttypedefinition",
            name="kind",
            field=models.CharField(
                choices=[("collection", "Collection"), ("singleton", "Singleton")],
                default="collection", max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="contententry",
            name="singleton_slot",
            field=models.OneToOneField(
                to="digitalafarin_cms_content.contenttypedefinition",
                blank=True, null=True, editable=False,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="singleton_entry",
            ),
        ),
    ]
