import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("digitalafarin_cms_audit", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="auditrun",
            name="max_pages",
            field=models.PositiveIntegerField(default=100),
        ),
        migrations.AlterField(
            model_name="auditissue",
            name="url",
            field=models.URLField(max_length=1500),
        ),
        migrations.CreateModel(
            name="AuditPage",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("url", models.URLField(max_length=1500)),
                ("final_url", models.URLField(blank=True, max_length=1500)),
                ("path", models.CharField(blank=True, max_length=1000)),
                ("status_code", models.PositiveSmallIntegerField(default=0)),
                ("content_type", models.CharField(blank=True, max_length=160)),
                ("response_ms", models.PositiveIntegerField(default=0)),
                ("title", models.CharField(blank=True, max_length=500)),
                ("meta_description", models.TextField(blank=True)),
                ("canonical_url", models.URLField(blank=True, max_length=1500)),
                ("robots", models.CharField(blank=True, max_length=255)),
                ("is_indexable", models.BooleanField(default=True)),
                ("h1_count", models.PositiveIntegerField(default=0)),
                ("h2_count", models.PositiveIntegerField(default=0)),
                ("word_count", models.PositiveIntegerField(default=0)),
                ("image_count", models.PositiveIntegerField(default=0)),
                ("missing_alt_count", models.PositiveIntegerField(default=0)),
                ("internal_links", models.PositiveIntegerField(default=0)),
                ("external_links", models.PositiveIntegerField(default=0)),
                ("incoming_internal_links", models.PositiveIntegerField(default=0)),
                ("issue_count", models.PositiveIntegerField(default=0)),
                ("run", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="pages", to="digitalafarin_cms_audit.auditrun")),
            ],
            options={"ordering": ["url"]},
        ),
        migrations.AddConstraint(
            model_name="auditpage",
            constraint=models.UniqueConstraint(fields=("run", "url"), name="unique_audit_page_run_url"),
        ),
        migrations.AddIndex(
            model_name="auditpage",
            index=models.Index(fields=["run", "status_code"], name="audit_pg_run_status_idx"),
        ),
        migrations.AddIndex(
            model_name="auditpage",
            index=models.Index(fields=["run", "is_indexable"], name="audit_pg_run_index_idx"),
        ),
        migrations.AddField(
            model_name="auditissue",
            name="page",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="issues", to="digitalafarin_cms_audit.auditpage"),
        ),
        migrations.AddIndex(
            model_name="auditissue",
            index=models.Index(fields=["run", "severity"], name="audit_issue_severity_idx"),
        ),
        migrations.AddIndex(
            model_name="auditissue",
            index=models.Index(fields=["run", "code"], name="audit_issue_code_idx"),
        ),
    ]
