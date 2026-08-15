from celery import shared_task
from django.utils import timezone
from .models import ContentEntry
from .services import create_revision

@shared_task
def publish_due_entries():
    due=ContentEntry.objects.filter(status=ContentEntry.Status.SCHEDULED,scheduled_at__isnull=False,scheduled_at__lte=timezone.now())
    count=0
    for entry in due.iterator():
        entry.publish(); create_revision(entry,None,"Scheduled publication"); count += 1
    return count
