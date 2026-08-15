import re

from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from digitalafarin_cms.apps.sites.models import Site
from .models import InternalLinkSuggestion, Keyword, KeywordCluster, KeywordMapping, Redirect, SchemaMarkup, SeoMeta
from .serializers import InternalLinkSuggestionSerializer, KeywordClusterSerializer, KeywordMappingSerializer, KeywordSerializer, RedirectSerializer, SchemaMarkupSerializer, SeoMetaSerializer


class SeoMetaViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = SeoMeta.objects.select_related("entry", "entry__site").all()
    serializer_class = SeoMetaSerializer
    filterset_fields = ["entry", "entry__site", "robots_index"]
    search_fields = ["title", "description", "focus_keyword"]
    tenant_filter = "entry__site__organization_id"

    @action(detail=True, methods=["post"])
    def analyze(self, request, pk=None):
        meta = self.get_object()
        entry = meta.entry
        keyword = (meta.focus_keyword or "").strip().lower()

        def flatten(value):
            if isinstance(value, dict):
                return " ".join(flatten(v) for v in value.values())
            if isinstance(value, list):
                return " ".join(flatten(v) for v in value)
            return str(value) if value is not None else ""

        block_text = flatten(entry.blocks)
        text = " ".join([entry.title, entry.excerpt, block_text]).lower()
        words = re.findall(r"\w+", text, flags=re.UNICODE)
        headings = [b for b in entry.blocks if isinstance(b, dict) and b.get("type") == "heading"]
        h1 = [b for b in headings if str(b.get("data", {}).get("level", "")) == "1"]
        h2_text = " ".join(
            flatten(b.get("data", {}))
            for b in headings
            if str(b.get("data", {}).get("level", "")) == "2"
        ).lower()
        images = [b for b in entry.blocks if isinstance(b, dict) and b.get("type") == "image"]
        missing_alt = sum(1 for b in images if not b.get("data", {}).get("alt"))
        internal_links = text.count('href="/') + sum(
            1
            for b in entry.blocks
            if isinstance(b, dict)
            and b.get("type") == "link"
            and str(b.get("data", {}).get("url", "")).startswith("/")
        )
        checks = {
            "keyword_in_title": bool(keyword and keyword in entry.title.lower()),
            "keyword_in_description": bool(keyword and keyword in meta.description.lower()),
            "keyword_in_path": bool(keyword and any(part in entry.path.lower() for part in keyword.split())),
            "keyword_in_h2": bool(keyword and keyword in h2_text) if headings else False,
            "has_meta_title": bool(meta.title),
            "has_meta_description": bool(meta.description),
            "title_length_ok": 30 <= len(meta.title) <= 65,
            "description_length_ok": 80 <= len(meta.description) <= 180,
            "single_h1_or_template_h1": len(h1) <= 1,
            "word_count_adequate": len(words) >= 300,
            "images_have_alt": missing_alt == 0,
            "has_internal_links": internal_links >= 1,
        }
        score = round(sum(1 for value in checks.values() if value) / len(checks) * 100)
        analysis = {
            "checks": checks,
            "metrics": {
                "word_count": len(words),
                "h1_count": len(h1),
                "image_count": len(images),
                "missing_alt": missing_alt,
                "internal_links": internal_links,
            },
        }
        meta.analysis = analysis
        meta.seo_score = score
        meta.save(update_fields=["analysis", "seo_score", "updated_at"])
        return Response({"score": score, **analysis})


class SchemaMarkupViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = SchemaMarkup.objects.select_related("entry", "entry__site").all()
    serializer_class = SchemaMarkupSerializer
    filterset_fields = ["entry", "schema_type", "is_active"]
    tenant_filter = "entry__site__organization_id"


class KeywordClusterViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = KeywordCluster.objects.select_related("site").all()
    serializer_class = KeywordClusterSerializer
    filterset_fields = ["site", "intent"]
    search_fields = ["name"]
    tenant_filter = "site__organization_id"


class KeywordViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Keyword.objects.select_related("site", "cluster").all()
    serializer_class = KeywordSerializer
    filterset_fields = ["site", "cluster", "intent"]
    search_fields = ["phrase"]
    tenant_filter = "site__organization_id"


class KeywordMappingViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = KeywordMapping.objects.select_related("keyword", "entry", "entry__site").all()
    serializer_class = KeywordMappingSerializer
    filterset_fields = ["keyword", "entry", "is_primary"]
    tenant_filter = "entry__site__organization_id"


class RedirectViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Redirect.objects.select_related("site").all()
    serializer_class = RedirectSerializer
    filterset_fields = ["site", "redirect_type", "is_active"]
    search_fields = ["source_path", "destination_path"]
    tenant_filter = "site__organization_id"


class InternalLinkSuggestionViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = InternalLinkSuggestion.objects.select_related("source_entry", "target_entry").all()
    serializer_class = InternalLinkSuggestionSerializer
    filterset_fields = ["source_entry", "target_entry", "status"]
    tenant_filter = "source_entry__site__organization_id"


@api_view(["GET"])
@permission_classes([AllowAny])
def resolve_redirect(request):
    domain = request.query_params.get("site")
    path = request.query_params.get("path")
    if not domain or not path:
        return Response({"detail": "site and path are required"}, status=400)
    try:
        site = Site.objects.get(domain=domain, is_active=True)
    except Site.DoesNotExist:
        return Response({"detail": "Site not found"}, status=404)
    redirect = Redirect.objects.filter(site=site, source_path=path, is_active=True).first()
    if not redirect:
        return Response({"match": False})
    Redirect.objects.filter(pk=redirect.pk).update(hits=redirect.hits + 1)
    return Response({
        "match": True,
        "type": int(redirect.redirect_type),
        "destination": redirect.destination_path or None,
    })
