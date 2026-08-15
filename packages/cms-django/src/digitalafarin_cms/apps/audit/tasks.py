from celery import shared_task
from django.utils import timezone

from .models import AuditRun
from .services import execute_audit


@shared_task
def run_audit(audit_run_id):
    run = AuditRun.objects.select_related("site").get(id=audit_run_id)
    try:
        return execute_audit(run)
    except Exception as exc:
        run.status = AuditRun.Status.FAILED
        run.finished_at = timezone.now()
        run.summary = {
            **(run.summary or {}),
            "error": str(exc)[:2000],
        }
        run.save(update_fields=["status", "finished_at", "summary", "updated_at"])
        raise
