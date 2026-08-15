import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial=True
    dependencies=[migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations=[
        migrations.CreateModel(name="Organization",fields=[("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),("created_at",models.DateTimeField(auto_now_add=True)),("updated_at",models.DateTimeField(auto_now=True)),("name",models.CharField(max_length=160)),("slug",models.SlugField(max_length=160,unique=True)),("is_active",models.BooleanField(default=True))]),
        migrations.CreateModel(name="Site",fields=[("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),("created_at",models.DateTimeField(auto_now_add=True)),("updated_at",models.DateTimeField(auto_now=True)),("name",models.CharField(max_length=160)),("domain",models.CharField(max_length=255,unique=True)),("default_language",models.CharField(default="fa",max_length=10)),("timezone",models.CharField(default="Asia/Tehran",max_length=64)),("is_active",models.BooleanField(default=True)),("settings",models.JSONField(blank=True,default=dict)),("organization",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="sites",to="digitalafarin_cms_sites.organization"))]),
        migrations.CreateModel(name="Membership",fields=[("id",models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),("created_at",models.DateTimeField(auto_now_add=True)),("updated_at",models.DateTimeField(auto_now=True)),("role",models.CharField(choices=[("owner","Owner"),("admin","Admin"),("seo","SEO Manager"),("editor","Editor"),("writer","Writer"),("viewer","Viewer")],default="viewer",max_length=20)),("organization",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="memberships",to="digitalafarin_cms_sites.organization")),("user",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="cms_memberships",to=settings.AUTH_USER_MODEL))],options={"constraints":[models.UniqueConstraint(fields=("organization","user"),name="unique_org_member")]})
    ]
