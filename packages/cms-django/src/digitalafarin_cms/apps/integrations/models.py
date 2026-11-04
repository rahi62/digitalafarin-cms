from django.db import models

from digitalafarin_cms.apps.common.models import UUIDTimeStampedModel
from digitalafarin_cms.apps.content.models import ContentEntry
from digitalafarin_cms.apps.sites.models import Site


class WebhookEndpoint(UUIDTimeStampedModel):
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="webhooks")
    name = models.CharField(max_length=120)
    url = models.URLField(max_length=1000)
    secret = models.CharField(max_length=255, blank=True)
    events = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    last_status = models.PositiveIntegerField(null=True, blank=True)
    last_called_at = models.DateTimeField(null=True, blank=True)


class SearchImportRun(UUIDTimeStampedModel):
    class Provider(models.TextChoices):
        MANUAL = "manual", "Manual import"
        GSC = "gsc", "Google Search Console"

    class Status(models.TextChoices):
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="search_import_runs")
    provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.MANUAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COMPLETED)
    source_label = models.CharField(max_length=160, blank=True)
    date_start = models.DateField()
    date_end = models.DateField()
    rows_received = models.PositiveIntegerField(default=0)
    rows_upserted = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]


class SearchPerformanceDaily(UUIDTimeStampedModel):
    class Source(models.TextChoices):
        MANUAL = "manual", "Manual import"
        GSC = "gsc", "Google Search Console"

    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="search_performance")
    entry = models.ForeignKey(
        ContentEntry,
        on_delete=models.SET_NULL,
        related_name="search_performance",
        null=True,
        blank=True,
    )
    date = models.DateField()
    path = models.CharField(max_length=1000)
    page_url = models.URLField(max_length=2000, blank=True)
    clicks = models.PositiveIntegerField(default=0)
    impressions = models.PositiveIntegerField(default=0)
    ctr = models.FloatField(default=0.0)
    position = models.FloatField(default=0.0)
    top_queries = models.JSONField(default=list, blank=True)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)

    class Meta:
        ordering = ["-date", "path"]
        constraints = [
            models.UniqueConstraint(
                fields=["site", "date", "path"],
                name="unique_search_performance_site_date_path",
            )
        ]
        indexes = [
            models.Index(fields=["site", "date"], name="search_perf_site_date_idx"),
            models.Index(fields=["site", "path"], name="search_perf_site_path_idx"),
        ]


class WebhookDelivery(UUIDTimeStampedModel):
    """Outbox row: one signed event for one endpoint (created atomically with the change)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RETRYING = "retrying", "Retrying"
        DELIVERED = "delivered", "Delivered"
        FAILED = "failed", "Failed"

    endpoint = models.ForeignKey(WebhookEndpoint, on_delete=models.CASCADE, related_name="deliveries")
    site = models.ForeignKey(Site, on_delete=models.CASCADE, related_name="webhook_deliveries")
    # Idempotency key sent to receivers; identical across retries and across endpoints.
    event_id = models.UUIDField()
    event_type = models.CharField(max_length=64)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    leased_until = models.DateTimeField(null=True, blank=True)
    last_status_code = models.PositiveIntegerField(null=True, blank=True)
    last_error = models.CharField(max_length=500, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["endpoint", "event_id"], name="unique_webhook_delivery_event"),
        ]
        indexes = [
            models.Index(fields=["status", "next_attempt_at"], name="cms_webhook_due_idx"),
        ]
