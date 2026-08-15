import uuid
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial=True
    dependencies=[("digitalafarin_cms_sites","0001_initial")]
    operations=[
        migrations.CreateModel(name="AuditRun",fields=[("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),("created_at",models.DateTimeField(auto_now_add=True)),("updated_at",models.DateTimeField(auto_now=True)),("status",models.CharField(choices=[("queued","Queued"),("running","Running"),("done","Done"),("failed","Failed")],default="queued",max_length=20)),("started_at",models.DateTimeField(blank=True,null=True)),("finished_at",models.DateTimeField(blank=True,null=True)),("pages_crawled",models.PositiveIntegerField(default=0)),("health_score",models.PositiveSmallIntegerField(default=0)),("summary",models.JSONField(blank=True,default=dict)),("site",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="audit_runs",to="digitalafarin_cms_sites.site"))]),
        migrations.CreateModel(name="AuditIssue",fields=[("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),("created_at",models.DateTimeField(auto_now_add=True)),("updated_at",models.DateTimeField(auto_now=True)),("url",models.URLField(max_length=1000)),("code",models.CharField(max_length=80)),("severity",models.CharField(choices=[("error","Error"),("warning","Warning"),("notice","Notice")],max_length=20)),("title",models.CharField(max_length=255)),("details",models.JSONField(blank=True,default=dict)),("is_resolved",models.BooleanField(default=False)),("run",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="issues",to="digitalafarin_cms_audit.auditrun"))])
    ]
