from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('digitalafarin_cms_content', '0010_backfill_published_routing')]

    operations = [
        migrations.AddConstraint(
            model_name='publishedentry',
            constraint=models.UniqueConstraint(fields=('site', 'normalized_path'), name='unique_published_site_normalized_path'),
        ),
    ]
