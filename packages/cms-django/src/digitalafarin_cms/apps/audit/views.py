from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from .models import AuditIssue, AuditRun
from .serializers import AuditIssueSerializer, AuditRunSerializer
from .tasks import run_audit


class AuditRunViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = AuditRun.objects.select_related("site").all().order_by("-created_at")
    serializer_class = AuditRunSerializer
    filterset_fields = ["site", "status"]
    tenant_filter = "site__organization_id"

    @action(detail=True, methods=["post"])
    def execute(self, request, pk=None):
        run = self.get_object()
        run_audit.delay(str(run.id))
        return Response({"queued": True, "audit_run": str(run.id)})


class AuditIssueViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = AuditIssue.objects.select_related("run", "run__site").all()
    serializer_class = AuditIssueSerializer
    filterset_fields = ["run", "severity", "code", "is_resolved"]
    search_fields = ["url", "title", "code"]
    tenant_filter = "run__site__organization_id"
