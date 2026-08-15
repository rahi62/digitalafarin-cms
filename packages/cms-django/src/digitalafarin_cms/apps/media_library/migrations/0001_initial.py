import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial=True
    dependencies=[("digitalafarin_cms_sites","0001_initial"),migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations=[migrations.CreateModel(name="MediaAsset",fields=[("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),("created_at",models.DateTimeField(auto_now_add=True)),("updated_at",models.DateTimeField(auto_now=True)),("file",models.FileField(upload_to="cms/%Y/%m/")),("filename",models.CharField(blank=True,max_length=255)),("mime_type",models.CharField(blank=True,max_length=120)),("alt_text",models.CharField(blank=True,max_length=255)),("caption",models.TextField(blank=True)),("width",models.PositiveIntegerField(blank=True,null=True)),("height",models.PositiveIntegerField(blank=True,null=True)),("size_bytes",models.PositiveBigIntegerField(default=0)),("folder",models.CharField(blank=True,max_length=255)),("site",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="media_assets",to="digitalafarin_cms_sites.site")),("uploaded_by",models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,to=settings.AUTH_USER_MODEL))])]
