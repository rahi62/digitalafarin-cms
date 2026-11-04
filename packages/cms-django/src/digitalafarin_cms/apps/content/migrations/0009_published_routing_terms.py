import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Schema only: new lookup columns and the term table (constraints follow the backfill)."""

    dependencies = [
        ('digitalafarin_cms_content', '0008_component_binding_approvals'),
        ('digitalafarin_cms_sites', '0003_cms_login_rate_buckets'),
    ]

    operations = [
        migrations.AddField(
            model_name='publishedentry',
            name='last_published_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='publishedentry',
            name='normalized_path',
            field=models.CharField(default='', editable=False, max_length=500),
        ),
        migrations.CreateModel(
            name='PublishedEntryTerm',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('category', 'Category'), ('tag', 'Tag')], max_length=16)),
                ('slug', models.CharField(max_length=255)),
                ('published_entry', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='terms', to='digitalafarin_cms_content.publishedentry')),
                ('site', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='published_terms', to='digitalafarin_cms_sites.site')),
            ],
        ),
        migrations.AddIndex(
            model_name='publishedentryterm',
            index=models.Index(fields=['site', 'kind', 'slug'], name='cms_pubterm_lookup'),
        ),
        migrations.AddConstraint(
            model_name='publishedentryterm',
            constraint=models.UniqueConstraint(fields=('published_entry', 'kind', 'slug'), name='unique_published_entry_term'),
        ),
    ]
