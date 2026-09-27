import json
import re

from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import (
    TenantScopedViewSetMixin,
    allowed_organization_ids,
    ensure_organization_write_access,
)
from digitalafarin_cms.apps.content.models import ContentEntry
from digitalafarin_cms.apps.sites.models import Site
from .models import InternalLinkSuggestion, Keyword, KeywordCluster, KeywordMapping, Redirect, SchemaMarkup, SeoMeta
from .serializers import InternalLinkSuggestionSerializer, KeywordClusterSerializer, KeywordMappingSerializer, KeywordSerializer, RedirectSerializer, SchemaMarkupSerializer, SeoMetaSerializer


def _flatten(value):
    if isinstance(value, dict):
        return " ".join(_flatten(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(_flatten(v) for v in value)
    return str(value) if value is not None else ""


def _node_text(node):
    if not isinstance(node, dict):
        return ""
    parts = []
    if isinstance(node.get("text"), str):
        parts.append(node["text"])
    content = node.get("content")
    if isinstance(content, list):
        parts.extend(_node_text(child) for child in content)
    return " ".join(part for part in parts if part)


def _iter_tiptap_nodes(node):
    if not isinstance(node, dict):
        return
    yield node
    content = node.get("content")
    if isinstance(content, list):
        for child in content:
            yield from _iter_tiptap_nodes(child)


def _seo_block_metrics(blocks):
    text_parts = []
    headings = []
    images = []
    internal_links = 0

    for block in blocks if isinstance(blocks, list) else []:
        if not isinstance(block, dict):
            continue
        block_type = block.get("type")
        data = block.get("data") if isinstance(block.get("data"), dict) else {}

        if block_type == "rich_text":
            text_parts.append(data.get("text") if isinstance(data.get("text"), str) else "")
            doc = data.get("doc")
            for node in _iter_tiptap_nodes(doc):
                node_type = node.get("type")
                attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
                if node_type == "heading":
                    headings.append({"level": attrs.get("level"), "text": _node_text(node)})
                elif node_type == "image":
                    images.append({"alt": attrs.get("alt")})

                marks = node.get("marks")
                if isinstance(marks, list):
                    for mark in marks:
                        if not isinstance(mark, dict) or mark.get("type") != "link":
                            continue
                        mark_attrs = mark.get("attrs") if isinstance(mark.get("attrs"), dict) else {}
                        if str(mark_attrs.get("href") or "").startswith("/"):
                            internal_links += 1
            continue

        text_parts.append(_flatten(data))
        if block_type == "heading":
            headings.append({"level": data.get("level"), "text": str(data.get("text") or "")})
        elif block_type == "image":
            images.append({"alt": data.get("alt")})
        elif block_type == "link" and str(data.get("url") or "").startswith("/"):
            internal_links += 1

    h1_count = sum(1 for heading in headings if str(heading.get("level") or "") == "1")
    h2_text = " ".join(
        str(heading.get("text") or "")
        for heading in headings
        if str(heading.get("level") or "") == "2"
    ).lower()
    missing_alt = sum(1 for image in images if not image.get("alt"))

    return {
        "text": " ".join(part for part in text_parts if part),
        "h1_count": h1_count,
        "h2_text": h2_text,
        "image_count": image_count,
        "missing_alt": missing_alt,
        "internal_links": internal_links,
    }


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

        metrics = _seo_block_metrics(entry.blocks)
        text = " ".join([entry.title, entry.excerpt, metrics["text"]]).lower()
        words = re.findall(r"\\w+", text, flags=re.UNICODE)
        h1_count = metrics["h1_count"]
        h2_text = metrics["h2_text"]
        image_count = metrics["image_count"]
        missing_alt = metrics["missing_alt"]
        internal_links = metrics["internal_links"]
        checks = {
            "keyword_in_title": bool(keyword and keyword in entry.title.lower()),
            "keyword_in_description": bool(keyword and keyword in meta.description.lower()),
            "keyword_in_path": bool(keyword and any(part in entry.path.lower() for part in keyword.split())),
            "keyword_in_h2": bool(keyword and keyword in h2_text),
            "has_meta_title": bool(meta.title),
            "has_meta_description": bool(meta.description),
            "title_length_ok": 30 <= len(meta.title) <= 65,
            "description_length_ok": 80 <= len(meta.description) <= 180,
            "single_h1_or_template_h1": h1_count <= 1,
            "word_count_adequate": len(words) >= 300,
            "images_have_alt": missing_alt == 0,
            "has_internal_links": internal_links >= 1,
        }
        score = round(sum(1 for value in checks.values() if value) / len(checks) * 100)
        analysis = {
            "checks": checks,
            "metrics": {
                "word_count": len(words),
                "h1_count": h1_count,
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
    queryset = InternalLinkSuggestion.objects.select_related(
        "source_entry", "source_entry__site", "target_entry", "target_entry__site"
    ).all()
    serializer_class = InternalLinkSuggestionSerializer
    filterset_fields = ["source_entry", "target_entry", "status"]
    tenant_filter = "source_entry__site__organization_id"

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        source_id = request.data.get("source_entry")
        if not source_id:
            return Response({"detail": "source_entry is required"}, status=400)

        source_queryset = ContentEntry.objects.select_related("site", "site__organization")
        allowed = allowed_organization_ids(request.user)
        if allowed is not None:
            source_queryset = source_queryset.filter(site__organization_id__in=allowed)
        try:
            source = source_queryset.get(pk=source_id)
        except ContentEntry.DoesNotExist:
            return Response({"detail": "Source entry not found"}, status=404)

        ensure_organization_write_access(request.user, source.site.organization_id)

        def flatten(value):
            if isinstance(value, dict):
                return " ".join(flatten(v) for v in value.values())
            if isinstance(value, list):
                return " ".join(flatten(v) for v in value)
            return str(value) if value is not None else ""

        source_text = " ".join([source.title, source.excerpt, flatten(source.blocks)]).lower()
        source_terms = {
            token
            for token in re.findall(r"\w+", source_text, flags=re.UNICODE)
            if len(token) >= 3 and not token.isdigit()
        }
        source_json = json.dumps(source.blocks, ensure_ascii=False).lower()

        blocked_targets = set(
            InternalLinkSuggestion.objects.filter(source_entry=source)
            .exclude(status="suggested")
            .values_list("target_entry_id", flat=True)
        )
        InternalLinkSuggestion.objects.filter(source_entry=source, status="suggested").delete()

        candidates = (
            ContentEntry.objects.filter(site=source.site, status=ContentEntry.Status.PUBLISHED)
            .exclude(pk=source.pk)
            .select_related("seo_meta")
        )
        ranked = []
        for target in candidates:
            if target.pk in blocked_targets:
                continue
            target_path = (target.path or "").lower()
            if target_path and target_path in source_json:
                continue

            title_phrase = (target.title or "").strip().lower()
            target_meta = getattr(target, "seo_meta", None)
            focus_phrase = ((target_meta.focus_keyword if target_meta else "") or "").strip().lower()
            target_terms = {
                token
                for token in re.findall(r"\w+", " ".join([title_phrase, focus_phrase]), flags=re.UNICODE)
                if len(token) >= 3 and not token.isdigit()
            }
            overlap = len(source_terms & target_terms)
            coverage = overlap / max(len(target_terms), 1)

            score = 0
            exact_title = bool(title_phrase and title_phrase in source_text)
            exact_focus = bool(focus_phrase and focus_phrase in source_text)
            if exact_title:
                score = max(score, 96)
            if exact_focus:
                score = max(score, 92)
            if overlap:
                score = max(score, min(85, round(25 + coverage * 60)))
            if score < 40:
                continue

            anchor = focus_phrase if exact_focus else target.title
            ranked.append((score, target, anchor))

        ranked.sort(key=lambda item: (-item[0], item[1].title.lower()))
        suggestions = [
            InternalLinkSuggestion(
                source_entry=source,
                target_entry=target,
                anchor_text=anchor,
                score=score,
                status="suggested",
            )
            for score, target, anchor in ranked[:10]
        ]
        InternalLinkSuggestion.objects.bulk_create(suggestions)
        serialized = InternalLinkSuggestionSerializer(suggestions, many=True).data
        return Response({"count": len(serialized), "results": serialized})


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
