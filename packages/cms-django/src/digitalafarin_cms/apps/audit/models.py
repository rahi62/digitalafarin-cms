from django.db import models
from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel
from digitalafarin_cms.apps.sites.models import Site

class AuditRun(UUIDTimeStampedModel):
    class Status(models.TextChoices): QUEUED="queued","Queued"; RUNNING="running","Running"; DONE="done","Done"; FAILED="failed","Failed"
    site=models.ForeignKey(Site,on_delete=models.CASCADE,related_name="audit_runs")
    status=models.CharField(max_length=20,choices=Status.choices,default=Status.QUEUED)
    started_at=models.DateTimeField(null=True,blank=True)
    finished_at=models.DateTimeField(null=True,blank=True)
    pages_crawled=models.PositiveIntegerField(default=0)
    health_score=models.PositiveSmallIntegerField(default=0)
    summary=models.JSONField(default=dict,blank=True)

class AuditIssue(UUIDTimeStampedModel):
    class Severity(models.TextChoices): ERROR="error","Error"; WARNING="warning","Warning"; NOTICE="notice","Notice"
    run=models.ForeignKey(AuditRun,on_delete=models.CASCADE,related_name="issues")
    url=models.URLField(max_length=1000)
    code=models.CharField(max_length=80)
    severity=models.CharField(max_length=20,choices=Severity.choices)
    title=models.CharField(max_length=255)
    details=models.JSONField(default=dict,blank=True)
    is_resolved=models.BooleanField(default=False)
