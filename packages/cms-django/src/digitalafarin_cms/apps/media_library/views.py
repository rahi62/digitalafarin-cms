import os

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from digitalafarin_cms.permissions import CmsIsAuthenticated as IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from .models import MediaAsset
from .serializers import MediaAssetSerializer


class MediaAssetPagination(PageNumberPagination):
    page_size = 40
    page_size_query_param = "page_size"
    max_page_size = 100


class MediaAssetViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = MediaAsset.objects.select_related("site").all().order_by("-created_at")
    serializer_class = MediaAssetSerializer
    pagination_class = MediaAssetPagination
    filterset_fields = ["site", "folder"]
    search_fields = ["filename", "alt_text", "caption", "folder"]
    ordering_fields = ["created_at", "filename", "size_bytes"]
    ordering = ["-created_at"]
    tenant_filter = "site__organization_id"

    def get_queryset(self):
        queryset = super().get_queryset()
        media_type = self.request.query_params.get("type")
        if media_type == "images":
            queryset = queryset.filter(mime_type__startswith="image/")
        elif media_type == "documents":
            queryset = queryset.exclude(mime_type__startswith="image/")
        return queryset

    @action(detail=False, methods=["get"])
    def folders(self, request):
        queryset = self.get_queryset()
        site = request.query_params.get("site")
        if site:
            queryset = queryset.filter(site_id=site)
        folders = (
            queryset.exclude(folder="")
            .values_list("folder", flat=True)
            .distinct()
            .order_by("folder")
        )
        return Response({"results": list(folders)})

    def perform_create(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        serializer.save(uploaded_by=self.request.user, **self._upload_metadata(serializer))

    def perform_update(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        serializer.save(**self._upload_metadata(serializer))

    @staticmethod
    def _upload_metadata(serializer):
        uploaded = serializer.validated_data.get("file")
        info = getattr(uploaded, "cms_upload_info", None)
        if info is None:
            return {}
        name = os.path.basename(str(uploaded.name).replace("\\", "/"))
        stem = os.path.splitext(name)[0][:200] or "file"
        return {
            "filename": stem + info.extension,
            "mime_type": info.mime_type,  # detected server-side, never the client header
            "size_bytes": info.size_bytes,
        }
