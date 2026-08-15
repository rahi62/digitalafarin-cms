import uuid
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial=True
    dependencies=[("digitalafarin_cms_sites","0001_initial")]
    operations=[migrations.CreateModel(name="WebhookEndpoint",fields=[("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),("created_at",models.DateTimeField(auto_now_add=True)),("updated_at",models.DateTimeField(auto_now=True)),("name",models.CharField(max_length=120)),("url",models.URLField(max_length=1000)),("secret",models.CharField(blank=True,max_length=255)),("events",models.JSONField(blank=True,default=list)),("is_active",models.BooleanField(default=True)),("last_status",models.PositiveIntegerField(blank=True,null=True)),("last_called_at",models.DateTimeField(blank=True,null=True)),("site",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="webhooks",to="digitalafarin_cms_sites.site"))])]
