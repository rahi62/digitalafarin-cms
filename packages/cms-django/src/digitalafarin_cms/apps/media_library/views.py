from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from .models import MediaAsset
from .serializers import MediaAssetSerializer


class MediaAssetViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = MediaAsset.objects.select_related("site").all().order_by("-created_at")
    serializer_class = MediaAssetSerializer
    filterset_fields = ["site", "folder"]
    search_fields = ["filename", "alt_text", "caption", "folder"]
    tenant_filter = "site__organization_id"

    def perform_create(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        uploaded = self.request.FILES.get("file")
        serializer.save(
            uploaded_by=self.request.user,
            filename=getattr(uploaded, "name", "") if uploaded else "",
            mime_type=getattr(uploaded, "content_type", "") if uploaded else "",
            size_bytes=getattr(uploaded, "size", 0) if uploaded else 0,
        )
