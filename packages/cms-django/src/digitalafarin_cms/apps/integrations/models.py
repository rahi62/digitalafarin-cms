from django.db import models
from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel
from digitalafarin_cms.apps.sites.models import Site
class WebhookEndpoint(UUIDTimeStampedModel):
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="webhooks")
    name=models.CharField(max_length=120)
    url=models.URLField(max_length=1000)
    secret=models.CharField(max_length=255,blank=True)
    events=models.JSONField(default=list,blank=True)
    is_active=models.BooleanField(default=True)
    last_status=models.PositiveIntegerField(null=True,blank=True)
    last_called_at=models.DateTimeField(null=True,blank=True)
