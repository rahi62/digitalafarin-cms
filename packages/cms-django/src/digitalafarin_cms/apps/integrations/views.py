from django.utils.dateparse import parse_date
from rest_framework import status as drf_status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import (
    TenantScopedViewSetMixin,
    ensure_organization_access,
    ensure_organization_roles,
)
from digitalafarin_cms.apps.sites.models import Membership, Site
from .models import SearchImportRun, SearchPerformanceDaily, WebhookEndpoint
from .search_performance import build_content_decay, import_search_performance
from .serializers import (
    SearchImportRunSerializer,
    SearchPerformanceDailySerializer,
    SearchPerformanceImportSerializer,
    WebhookEndpointSerializer,
)


SEARCH_DATA_WRITE_ROLES = (
    Membership.Role.OWNER,
    Membership.Role.ADMIN,
    Membership.Role.SEO,
)


class WebhookEndpointViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = WebhookEndpoint.objects.select_related("site").all()
    serializer_class = WebhookEndpointSerializer
    filterset_fields = ["site", "is_active"]
    search_fields = ["name", "url"]
    tenant_filter = "site__organization_id"


class SearchImportRunViewSet(TenantScopedViewSetMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = SearchImportRun.objects.select_related("site").all()
    serializer_class = SearchImportRunSerializer
    filterset_fields = ["site", "provider", "status"]
    ordering_fields = ["created_at", "date_start", "date_end", "rows_upserted"]
    tenant_filter = "site__organization_id"


class SearchPerformanceViewSet(TenantScopedViewSetMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = SearchPerformanceDaily.objects.select_related("site", "entry").all()
    serializer_class = SearchPerformanceDailySerializer
    filterset_fields = ["site", "source", "entry"]
    search_fields = ["path", "page_url", "entry__title"]
    ordering_fields = ["date", "clicks", "impressions", "ctr", "position", "path"]
    tenant_filter = "site__organization_id"

    def get_queryset(self):
        queryset = super().get_queryset()
        date_from = parse_date(self.request.query_params.get("date_from", ""))
        date_to = parse_date(self.request.query_params.get("date_to", ""))
        path = self.request.query_params.get("path", "").strip()
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        if path:
            queryset = queryset.filter(path=path)
        return queryset

    def _site(self, site_id):
        if not site_id:
            return None
        try:
            site = Site.objects.select_related("organization").get(pk=site_id)
        except Site.DoesNotExist:
            return None
        ensure_organization_access(self.request.user, site.organization_id)
        return site

    @action(detail=False, methods=["post"], url_path="import")
    def import_rows(self, request):
        serializer = SearchPerformanceImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        site = serializer.validated_data["site"]
        ensure_organization_roles(
            request.user,
            site.organization_id,
            SEARCH_DATA_WRITE_ROLES,
            "Only Owner, Admin or SEO Manager can import Search Console data.",
        )
        try:
            run = import_search_performance(
                site,
                serializer.validated_data["rows"],
                provider=serializer.validated_data["provider"],
                source_label=serializer.validated_data.get("source_label", ""),
            )
        except ValueError as error:
            return Response({"detail": str(error)}, status=drf_status.HTTP_400_BAD_REQUEST)
        return Response(SearchImportRunSerializer(run).data, status=drf_status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="decay")
    def decay(self, request):
        site = self._site(request.query_params.get("site"))
        if site is None:
            return Response({"detail": "A valid site parameter is required."}, status=drf_status.HTTP_400_BAD_REQUEST)

        current_end = None
        if request.query_params.get("current_end"):
            current_end = parse_date(request.query_params["current_end"])
            if current_end is None:
                return Response({"detail": "current_end must be YYYY-MM-DD."}, status=drf_status.HTTP_400_BAD_REQUEST)

        try:
            payload = build_content_decay(
                site,
                current_days=int(request.query_params.get("current_days", 28)),
                baseline_days=int(request.query_params.get("baseline_days", request.query_params.get("current_days", 28))),
                min_impressions=int(request.query_params.get("min_impressions", 100)),
                current_end=current_end,
                include_healthy=request.query_params.get("include_healthy") in {"1", "true", "True"},
            )
        except (TypeError, ValueError):
            return Response({"detail": "Invalid decay analysis parameters."}, status=drf_status.HTTP_400_BAD_REQUEST)
        return Response(payload)
