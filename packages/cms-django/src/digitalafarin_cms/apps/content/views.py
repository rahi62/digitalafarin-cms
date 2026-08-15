from django.http import HttpResponse
from xml.sax.saxutils import escape as xml_escape
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import TenantScopedViewSetMixin
from digitalafarin_cms.apps.seo.models import SchemaMarkup, SeoMeta
from digitalafarin_cms.apps.seo.serializers import SchemaMarkupSerializer, SeoMetaSerializer
from digitalafarin_cms.apps.sites.models import Site
from .models import Category, ContentEntry, ContentRevision, ContentTypeDefinition, Menu, ReusableBlock, Tag
from .serializers import CategorySerializer, ContentEntrySerializer, ContentRevisionSerializer, ContentTypeSerializer, MenuSerializer, ReusableBlockSerializer, TagSerializer
from .services import create_revision


class ContentTypeViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ContentTypeDefinition.objects.select_related("site").all()
    serializer_class = ContentTypeSerializer
    filterset_fields = ["site", "is_public"]
    search_fields = ["name", "slug"]
    tenant_filter = "site__organization_id"


class CategoryViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Category.objects.select_related("site", "parent").all()
    serializer_class = CategorySerializer
    filterset_fields = ["site", "parent"]
    search_fields = ["name", "slug"]
    tenant_filter = "site__organization_id"


class TagViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Tag.objects.select_related("site").all()
    serializer_class = TagSerializer
    filterset_fields = ["site"]
    search_fields = ["name", "slug"]
    tenant_filter = "site__organization_id"


class ContentEntryViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ContentEntry.objects.select_related("site", "content_type", "author").prefetch_related("categories", "tags").all()
    serializer_class = ContentEntrySerializer
    filterset_fields = ["site", "content_type", "status", "is_featured"]
    search_fields = ["title", "slug", "path", "excerpt"]
    ordering_fields = ["created_at", "updated_at", "published_at", "title"]
    tenant_filter = "site__organization_id"

    def perform_create(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        entry = serializer.save(author=serializer.validated_data.get("author") or self.request.user)
        create_revision(entry, self.request.user, "Initial revision")

    def perform_update(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        entry = serializer.save()
        create_revision(entry, self.request.user, "Updated")

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        entry = self.get_object()
        entry.publish()
        create_revision(entry, request.user, "Published")
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"])
    def restore_revision(self, request, pk=None):
        entry = self.get_object()
        revision = entry.revisions.get(id=request.data.get("revision_id"))
        snapshot = revision.snapshot
        for key in ["title", "slug", "path", "excerpt", "blocks", "custom_fields", "status"]:
            if key in snapshot:
                setattr(entry, key, snapshot[key])
        entry.save()
        create_revision(entry, request.user, f"Restored revision {revision.number}")
        return Response(self.get_serializer(entry).data)


class ContentRevisionViewSet(TenantScopedViewSetMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ContentRevision.objects.select_related("entry", "created_by").all()
    serializer_class = ContentRevisionSerializer
    filterset_fields = ["entry"]
    tenant_filter = "entry__site__organization_id"


class ReusableBlockViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = ReusableBlock.objects.all()
    serializer_class = ReusableBlockSerializer
    filterset_fields = ["site"]
    search_fields = ["name", "key"]
    tenant_filter = "site__organization_id"


class MenuViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Menu.objects.prefetch_related("items__children").all()
    serializer_class = MenuSerializer
    filterset_fields = ["site"]
    search_fields = ["name", "key"]
    tenant_filter = "site__organization_id"


@api_view(["GET"])
@permission_classes([AllowAny])
def resolve_path(request):
    domain = request.query_params.get("site")
    path = request.query_params.get("path", "/")
    if not domain:
        return Response({"detail": "site query parameter is required"}, status=400)
    try:
        site = Site.objects.get(domain=domain, is_active=True)
    except Site.DoesNotExist:
        return Response({"detail": "Site not found"}, status=404)
    try:
        entry = ContentEntry.objects.select_related("content_type", "author").prefetch_related("categories", "tags").get(
            site=site,
            path=path,
            status=ContentEntry.Status.PUBLISHED,
        )
    except ContentEntry.DoesNotExist:
        return Response({"detail": "Content not found"}, status=404)

    seo = SeoMeta.objects.filter(entry=entry).first()
    schemas = SchemaMarkup.objects.filter(entry=entry, is_active=True)
    related = ContentEntry.objects.filter(
        site=site,
        status=ContentEntry.Status.PUBLISHED,
        content_type=entry.content_type,
    ).exclude(pk=entry.pk)[:4]

    chain = []
    current = entry
    while current:
        chain.append({"title": current.title, "path": current.path})
        current = current.parent

    return Response({
        "site": {"name": site.name, "domain": site.domain, "language": site.default_language},
        "content": ContentEntrySerializer(entry).data,
        "blocks": entry.blocks,
        "seo": SeoMetaSerializer(seo).data if seo else None,
        "schemas": SchemaMarkupSerializer(schemas, many=True).data,
        "breadcrumbs": list(reversed(chain)),
        "related_content": [
            {"id": str(item.id), "title": item.title, "path": item.path, "excerpt": item.excerpt}
            for item in related
        ],
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def sitemap(request):
    domain = request.query_params.get("site")
    try:
        site = Site.objects.get(domain=domain, is_active=True)
    except Site.DoesNotExist:
        return HttpResponse("Site not found", status=404)
    entries = ContentEntry.objects.filter(site=site, status=ContentEntry.Status.PUBLISHED).exclude(
        seo_meta__robots_index=False
    ).order_by("path")
    base = f"https://{site.domain}"
    rows = [
        f"<url><loc>{xml_escape(base + entry.path)}</loc><lastmod>{entry.updated_at.date().isoformat()}</lastmod></url>"
        for entry in entries
    ]
    xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(rows) + "</urlset>"
    return HttpResponse(xml, content_type="application/xml")


@api_view(["GET"])
@permission_classes([AllowAny])
def robots_txt(request):
    domain = request.query_params.get("site")
    try:
        site = Site.objects.get(domain=domain, is_active=True)
    except Site.DoesNotExist:
        return HttpResponse("Site not found", status=404)
    body = f"User-agent: *\nAllow: /\nSitemap: https://{site.domain}/sitemap.xml\n"
    return HttpResponse(body, content_type="text/plain")
