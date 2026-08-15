from django.conf import settings
from django.db import models
from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel
from digitalafarin_cms.apps.sites.models import Site
class MediaAsset(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="media_assets")
    file=models.FileField(upload_to="cms/%Y/%m/")
    filename=models.CharField(max_length=255,blank=True)
    mime_type=models.CharField(max_length=120,blank=True)
    alt_text=models.CharField(max_length=255,blank=True)
    caption=models.TextField(blank=True)
    width=models.PositiveIntegerField(null=True,blank=True)
    height=models.PositiveIntegerField(null=True,blank=True)
    size_bytes=models.PositiveBigIntegerField(default=0)
    uploaded_by=models.ForeignKey(settings.AUTH_USER_MODEL,null=True,blank=True,on_delete=models.SET_NULL)
    folder=models.CharField(max_length=255,blank=True)
    def __str__(self): return self.filename or self.file.name
