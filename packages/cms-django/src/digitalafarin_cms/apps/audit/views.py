from rest_framework import status as drf_status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from .models import AuditIssue, AuditPage, AuditRun
from .serializers import AuditIssueSerializer, AuditPageSerializer, AuditRunSerializer
from .tasks import run_audit


class AuditRunViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = AuditRun.objects.select_related("site").annotate().all().order_by("-created_at")
    serializer_class = AuditRunSerializer
    filterset_fields = ["site", "status"]
    ordering_fields = ["created_at", "started_at", "finished_at", "health_score", "pages_crawled"]
    tenant_filter = "site__organization_id"

    def _queue(self, run):
        if run.status == AuditRun.Status.RUNNING:
            return Response({"detail": "Audit is already running."}, status=drf_status.HTTP_409_CONFLICT)
        run.status = AuditRun.Status.QUEUED
        run.save(update_fields=["status", "updated_at"])
        run_audit.delay(str(run.id))
        return Response({"queued": True, "audit_run": str(run.id)})

    @action(detail=False, methods=["post"])
    def start(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.validate_tenant_serializer(serializer, require_write=True)
        run = serializer.save(status=AuditRun.Status.QUEUED)
        run_audit.delay(str(run.id))
        return Response(self.get_serializer(run).data, status=drf_status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def execute(self, request, pk=None):
        return self._queue(self.get_object())

    @action(detail=True, methods=["post"])
    def rerun(self, request, pk=None):
        return self._queue(self.get_object())


class AuditPageViewSet(TenantScopedViewSetMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = AuditPage.objects.select_related("run", "run__site").all()
    serializer_class = AuditPageSerializer
    filterset_fields = ["run", "status_code", "is_indexable"]
    search_fields = ["url", "path", "title", "meta_description", "canonical_url"]
    ordering_fields = ["url", "status_code", "response_ms", "word_count", "issue_count", "incoming_internal_links"]
    tenant_filter = "run__site__organization_id"


class AuditIssueViewSet(TenantScopedViewSetMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = AuditIssue.objects.select_related("run", "run__site", "page").all()
    serializer_class = AuditIssueSerializer
    filterset_fields = ["run", "page", "severity", "code", "is_resolved"]
    search_fields = ["url", "title", "code"]
    ordering_fields = ["created_at", "severity", "code", "url"]
    tenant_filter = "run__site__organization_id"

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        issue = self.get_object()
        issue.is_resolved = True
        issue.save(update_fields=["is_resolved", "updated_at"])
        return Response(self.get_serializer(issue).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        issue = self.get_object()
        issue.is_resolved = False
        issue.save(update_fields=["is_resolved", "updated_at"])
        return Response(self.get_serializer(issue).data)
