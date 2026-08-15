from celery import shared_task
from django.utils import timezone
from .models import AuditRun

@shared_task
def run_audit(audit_run_id):
    run=AuditRun.objects.get(id=audit_run_id)
    run.status=AuditRun.Status.RUNNING; run.started_at=timezone.now(); run.save(update_fields=["status","started_at","updated_at"])
    # V1 worker foundation: advanced HTTP crawling is intentionally a separate expansion module.
    entries=run.site.entries.filter(status="published")
    issues=[]
    for entry in entries:
        if not hasattr(entry,"seo_meta"):
            issues.append({"url":f"https://{run.site.domain}{entry.path}","code":"missing_seo_meta","severity":"warning","title":"Missing SEO metadata"})
    from .models import AuditIssue
    AuditIssue.objects.bulk_create([AuditIssue(run=run,**x) for x in issues])
    count=entries.count(); score=max(0,100-min(100,len(issues)*10))
    run.status=AuditRun.Status.DONE; run.finished_at=timezone.now(); run.pages_crawled=count; run.health_score=score; run.summary={"issues":len(issues)}
    run.save(update_fields=["status","finished_at","pages_crawled","health_score","summary","updated_at"])
    return {"pages":count,"issues":len(issues),"score":score}
