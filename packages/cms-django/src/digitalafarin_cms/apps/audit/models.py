from django.db import models
from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel
from digitalafarin_cms.apps.sites.models import Site


class AuditRun(UUIDTimeStampedModel):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"

    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="audit_runs")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    pages_crawled = models.PositiveIntegerField(default=0)
    max_pages = models.PositiveIntegerField(default=100)
    health_score = models.PositiveSmallIntegerField(default=0)
    summary = models.JSONField(default=dict, blank=True)


class AuditPage(UUIDTimeStampedModel):
    run = models.ForeignKey(AuditRun, on_delete=models.CASCADE, related_name="pages")
    url = models.URLField(max_length=1500)
    final_url = models.URLField(max_length=1500, blank=True)
    path = models.CharField(max_length=1000, blank=True)
    status_code = models.PositiveSmallIntegerField(default=0)
    content_type = models.CharField(max_length=160, blank=True)
    response_ms = models.PositiveIntegerField(default=0)
    title = models.CharField(max_length=500, blank=True)
    meta_description = models.TextField(blank=True)
    canonical_url = models.URLField(max_length=1500, blank=True)
    robots = models.CharField(max_length=255, blank=True)
    is_indexable = models.BooleanField(default=True)
    h1_count = models.PositiveIntegerField(default=0)
    h2_count = models.PositiveIntegerField(default=0)
    word_count = models.PositiveIntegerField(default=0)
    image_count = models.PositiveIntegerField(default=0)
    missing_alt_count = models.PositiveIntegerField(default=0)
    internal_links = models.PositiveIntegerField(default=0)
    external_links = models.PositiveIntegerField(default=0)
    incoming_internal_links = models.PositiveIntegerField(default=0)
    issue_count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["run", "url"], name="unique_audit_page_run_url")
        ]
        ordering = ["url"]
        indexes = [
            models.Index(fields=["run", "status_code"], name="audit_pg_run_status_idx"),
            models.Index(fields=["run", "is_indexable"], name="audit_pg_run_index_idx"),
        ]


class AuditIssue(UUIDTimeStampedModel):
    class Severity(models.TextChoices):
        ERROR = "error", "Error"
        WARNING = "warning", "Warning"
        NOTICE = "notice", "Notice"

    run = models.ForeignKey(AuditRun, on_delete=models.CASCADE, related_name="issues")
    page = models.ForeignKey(
        AuditPage,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="issues",
    )
    url = models.URLField(max_length=1500)
    code = models.CharField(max_length=80)
    severity = models.CharField(max_length=20, choices=Severity.choices)
    title = models.CharField(max_length=255)
    details = models.JSONField(default=dict, blank=True)
    is_resolved = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["run", "severity"], name="audit_issue_severity_idx"),
            models.Index(fields=["run", "code"], name="audit_issue_code_idx"),
        ]
