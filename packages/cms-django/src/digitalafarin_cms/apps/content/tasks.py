import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import ContentEntry
from .services import create_revision

logger = logging.getLogger("digitalafarin_cms.content")


def publish_due() -> int:
    """Publish every due scheduled entry exactly once, even with concurrent workers.

    Each entry is processed in its own transaction under ``SELECT ... FOR UPDATE SKIP LOCKED``
    and its state is re-checked after the lock, so a second worker either skips the row
    (locked) or finds it already published. Safe to run from Celery Beat or cron.
    """
    now = timezone.now()
    due_ids = list(
        ContentEntry.objects.filter(
            status=ContentEntry.Status.SCHEDULED, scheduled_at__isnull=False, scheduled_at__lte=now,
        ).values_list("pk", flat=True)
    )
    published = 0
    for pk in due_ids:
        try:
            with transaction.atomic():
                entry = (
                    ContentEntry.objects.select_for_update(skip_locked=True, of=("self",))
                    .filter(pk=pk, status=ContentEntry.Status.SCHEDULED,
                            scheduled_at__isnull=False, scheduled_at__lte=timezone.now())
                    .first()
                )
                if entry is None:  # locked by another worker, or no longer due
                    continue
                entry.publish()
                create_revision(entry, None, "Scheduled publication")
                published += 1
                logger.info("scheduled entry published entry=%s site=%s", entry.pk, entry.site_id)
        except Exception:
            logger.exception("scheduled publication failed entry=%s", pk)
    return published


@shared_task(name="digitalafarin_cms.apps.content.tasks.publish_due_entries")
def publish_due_entries():
    return publish_due()
