import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("digitalafarin_cms_integrations", "0001_initial"),
        ("digitalafarin_cms_content", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="SearchImportRun",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("provider", models.CharField(choices=[("manual", "Manual import"), ("gsc", "Google Search Console")], default="manual", max_length=20)),
                ("status", models.CharField(choices=[("completed", "Completed"), ("failed", "Failed")], default="completed", max_length=20)),
                ("source_label", models.CharField(blank=True, max_length=160)),
                ("date_start", models.DateField()),
                ("date_end", models.DateField()),
                ("rows_received", models.PositiveIntegerField(default=0)),
                ("rows_upserted", models.PositiveIntegerField(default=0)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("error", models.TextField(blank=True)),
                ("site", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="search_import_runs", to="digitalafarin_cms_sites.site")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="SearchPerformanceDaily",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("date", models.DateField()),
                ("path", models.CharField(max_length=1000)),
                ("page_url", models.URLField(blank=True, max_length=2000)),
                ("clicks", models.PositiveIntegerField(default=0)),
                ("impressions", models.PositiveIntegerField(default=0)),
                ("ctr", models.FloatField(default=0.0)),
                ("position", models.FloatField(default=0.0)),
                ("top_queries", models.JSONField(blank=True, default=list)),
                ("source", models.CharField(choices=[("manual", "Manual import"), ("gsc", "Google Search Console")], default="manual", max_length=20)),
                ("entry", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="search_performance", to="digitalafarin_cms_content.contententry")),
                ("site", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="search_performance", to="digitalafarin_cms_sites.site")),
            ],
            options={
                "ordering": ["-date", "path"],
                "indexes": [
                    models.Index(fields=["site", "date"], name="search_perf_site_date_idx"),
                    models.Index(fields=["site", "path"], name="search_perf_site_path_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("site", "date", "path"), name="unique_search_performance_site_date_path")
                ],
            },
        ),
    ]
