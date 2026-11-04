import logging
from celery import shared_task
from django.utils import timezone

from .models import AuditRun
from .services import execute_audit

logger = logging.getLogger("digitalafarin_cms.audit")


@shared_task
def run_audit(audit_run_id):
    run = AuditRun.objects.select_related("site").get(id=audit_run_id)
    logger.info("audit started run=%s site=%s", run.pk, run.site_id)
    try:
        result = execute_audit(run)
        logger.info("audit finished run=%s site=%s", run.pk, run.site_id)
        return result
    except Exception as exc:
        logger.exception("audit failed run=%s site=%s", run.pk, run.site_id)
        run.status = AuditRun.Status.FAILED
        run.finished_at = timezone.now()
        run.summary = {
            **(run.summary or {}),
            "error": str(exc)[:2000],
        }
        run.save(update_fields=["status", "finished_at", "summary", "updated_at"])
        raise
