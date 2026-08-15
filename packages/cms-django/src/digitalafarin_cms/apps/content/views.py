from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from xml.sax.saxutils import escape as xml_escape
from rest_framework import status as drf_status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import (
    TenantScopedViewSetMixin,
    ensure_organization_roles,
    organization_role,
    user_has_organization_role,
)
from digitalafarin_cms.apps.seo.models import SchemaMarkup, SeoMeta
from digitalafarin_cms.apps.seo.serializers import SchemaMarkupSerializer, SeoMetaSerializer
from digitalafarin_cms.apps.sites.models import Membership, Site
from .models import Category, ContentEntry, ContentRevision, ContentTypeDefinition, Menu, ReusableBlock, Tag
from .serializers import CategorySerializer, ContentEntrySerializer, ContentRevisionSerializer, ContentTypeSerializer, MenuSerializer, ReusableBlockSerializer, TagSerializer
from .services import create_revision


PREVIEW_SALT = "digitalafarin-cms-preview"
PUBLISH_ROLES = (
    Membership.Role.OWNER,
    Membership.Role.ADMIN,
    Membership.Role.EDITOR,
    Membership.Role.SEO,
)
PROTECTED_STATUSES = {ContentEntry.Status.PUBLISHED, ContentEntry.Status.SCHEDULED}


def preview_max_age():
    return int(getattr(settings, "DIGITALAFARIN_CMS_PREVIEW_MAX_AGE", 900))


def frontend_base_for(site):
    configured = (site.settings or {}).get("frontend_url", "").strip()
    if configured:
        return configured.rstrip("/")
    domain = site.domain.strip().rstrip("/")
    if domain.startswith(("http://", "https://")):
        return domain
    scheme = "http" if domain.startswith(("localhost", "127.0.0.1")) else "https"
    return f"{scheme}://{domain}"


def _parse_editorial_datetime(value):
    parsed = parse_datetime(str(value or ""))
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _publisher(user, entry):
    return user_has_organization_role(user, entry.site.organization_id, PUBLISH_ROLES)


def _require_publisher(user, entry):
    ensure_organization_roles(
        user,
        entry.site.organization_id,
        PUBLISH_ROLES,
        "Only Owner, Admin, Editor or SEO Manager can publish or schedule content.",
    )


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
    queryset = ContentEntry.objects.select_related("site", "site__organization", "content_type", "author", "parent").prefetch_related("categories", "tags").all()
    serializer_class = ContentEntrySerializer
    filterset_fields = ["site", "content_type", "status", "is_featured", "parent"]
    search_fields = ["title", "slug", "path", "excerpt"]
    ordering_fields = ["created_at", "updated_at", "published_at", "scheduled_at", "title"]
    tenant_filter = "site__organization_id"

    def perform_create(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        requested_status = serializer.validated_data.get("status", ContentEntry.Status.DRAFT)
        if requested_status in PROTECTED_STATUSES:
            raise PermissionDenied("Create content as draft/review, then use the publish or schedule action.")
        entry = serializer.save(author=self.request.user)
        create_revision(entry, self.request.user, "Initial revision")

    def perform_update(self, serializer):
        self.validate_tenant_serializer(serializer, require_write=True)
        entry = serializer.instance
        requested_status = serializer.validated_data.get("status", entry.status)

        if entry.status in PROTECTED_STATUSES and not _publisher(self.request.user, entry):
            raise PermissionDenied("Only publishing roles can edit published or scheduled content.")
        if requested_status in PROTECTED_STATUSES and requested_status != entry.status:
            raise PermissionDenied("Use the publish or schedule workflow action for this transition.")

        saved = serializer.save()
        create_revision(saved, self.request.user, "Updated")

    @action(detail=True, methods=["get"])
    def workflow(self, request, pk=None):
        entry = self.get_object()
        role = organization_role(request.user, entry.site.organization_id)
        can_publish = _publisher(request.user, entry)
        return Response({
            "role": role,
            "status": entry.status,
            "scheduled_at": entry.scheduled_at,
            "published_at": entry.published_at,
            "can_publish": can_publish,
            "can_schedule": can_publish,
            "can_submit_review": entry.status not in PROTECTED_STATUSES,
            "can_return_draft": entry.status not in PROTECTED_STATUSES or can_publish,
            "can_unschedule": entry.status == ContentEntry.Status.SCHEDULED and can_publish,
        })

    @action(detail=True, methods=["post"], url_path="submit-review")
    def submit_review(self, request, pk=None):
        entry = self.get_object()
        if entry.status in PROTECTED_STATUSES:
            return Response(
                {"detail": "Published or scheduled content must be returned to draft by a publishing role first."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )
        entry.status = ContentEntry.Status.REVIEW
        entry.scheduled_at = None
        entry.save(update_fields=["status", "scheduled_at", "updated_at"])
        create_revision(entry, request.user, "Submitted for review")
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"], url_path="return-draft")
    def return_draft(self, request, pk=None):
        entry = self.get_object()
        if entry.status in PROTECTED_STATUSES:
            _require_publisher(request.user, entry)
        entry.status = ContentEntry.Status.DRAFT
        entry.scheduled_at = None
        entry.save(update_fields=["status", "scheduled_at", "updated_at"])
        create_revision(entry, request.user, "Returned to draft")
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        entry = self.get_object()
        _require_publisher(request.user, entry)
        entry.publish()
        create_revision(entry, request.user, "Published")
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"])
    def schedule(self, request, pk=None):
        entry = self.get_object()
        _require_publisher(request.user, entry)
        scheduled_at = _parse_editorial_datetime(request.data.get("scheduled_at"))
        if scheduled_at is None:
            return Response({"detail": "A valid scheduled_at ISO datetime is required."}, status=400)
        if scheduled_at <= timezone.now():
            return Response({"detail": "scheduled_at must be in the future."}, status=400)
        entry.status = ContentEntry.Status.SCHEDULED
        entry.scheduled_at = scheduled_at
        entry.published_at = None
        entry.save(update_fields=["status", "scheduled_at", "published_at", "updated_at"])
        create_revision(entry, request.user, "Scheduled publication")
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"])
    def unschedule(self, request, pk=None):
        entry = self.get_object()
        _require_publisher(request.user, entry)
        if entry.status != ContentEntry.Status.SCHEDULED:
            return Response({"detail": "Content is not scheduled."}, status=400)
        entry.status = ContentEntry.Status.DRAFT
        entry.scheduled_at = None
        entry.save(update_fields=["status", "scheduled_at", "updated_at"])
        create_revision(entry, request.user, "Schedule cancelled")
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"], url_path="preview")
    def preview(self, request, pk=None):
        entry = self.get_object()
        token = signing.dumps(
            {"entry_id": str(entry.pk), "site_id": str(entry.site_id)},
            salt=PREVIEW_SALT,
            compress=True,
        )
        query = urlencode({"cms_preview": token})
        return Response({
            "token": token,
            "expires_in": preview_max_age(),
            "site": entry.site.domain,
            "path": entry.path,
            "frontend_url": f"{frontend_base_for(entry.site)}{entry.path}?{query}",
        })

    @action(detail=True, methods=["post"])
    def restore_revision(self, request, pk=None):
        entry = self.get_object()
        revision = entry.revisions.get(id=request.data.get("revision_id"))
        snapshot = revision.snapshot
        target_status = snapshot.get("status", entry.status)
        if target_status in PROTECTED_STATUSES:
            _require_publisher(request.user, entry)

        for key in ["title", "slug", "path", "excerpt", "blocks", "custom_fields", "status", "is_featured"]:
            if key in snapshot:
                setattr(entry, key, snapshot[key])

        if "parent_id" in snapshot:
            parent_id = snapshot.get("parent_id")
            entry.parent = (
                ContentEntry.objects.filter(pk=parent_id, site=entry.site).first()
                if parent_id else None
            )
        if "scheduled_at" in snapshot:
            entry.scheduled_at = _parse_editorial_datetime(snapshot.get("scheduled_at"))
        if "published_at" in snapshot:
            entry.published_at = _parse_editorial_datetime(snapshot.get("published_at"))
        entry.save()

        if "category_ids" in snapshot:
            entry.categories.set(Category.objects.filter(site=entry.site, id__in=snapshot.get("category_ids") or []))
        if "tag_ids" in snapshot:
            entry.tags.set(Tag.objects.filter(site=entry.site, id__in=snapshot.get("tag_ids") or []))

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
    preview_token = request.query_params.get("preview", "")
    if not domain:
        return Response({"detail": "site query parameter is required"}, status=400)
    try:
        site = Site.objects.get(domain=domain, is_active=True)
    except Site.DoesNotExist:
        return Response({"detail": "Site not found"}, status=404)

    if preview_token:
        try:
            payload = signing.loads(preview_token, salt=PREVIEW_SALT, max_age=preview_max_age())
        except signing.SignatureExpired:
            return Response({"detail": "Preview token expired"}, status=403)
        except signing.BadSignature:
            return Response({"detail": "Invalid preview token"}, status=403)
        if str(payload.get("site_id")) != str(site.pk):
            return Response({"detail": "Preview token does not match this site"}, status=403)
        try:
            entry = ContentEntry.objects.select_related("content_type", "author", "parent").prefetch_related("categories", "tags").get(
                pk=payload.get("entry_id"),
                site=site,
                path=path,
            )
        except ContentEntry.DoesNotExist:
            return Response({"detail": "Preview content not found"}, status=404)
    else:
        try:
            entry = ContentEntry.objects.select_related("content_type", "author", "parent").prefetch_related("categories", "tags").get(
                site=site,
                path=path,
                status=ContentEntry.Status.PUBLISHED,
                content_type__is_public=True,
            )
        except ContentEntry.DoesNotExist:
            return Response({"detail": "Content not found"}, status=404)

    seo = SeoMeta.objects.filter(entry=entry).first()
    schemas = SchemaMarkup.objects.filter(entry=entry, is_active=True)
    related = ContentEntry.objects.filter(
        site=site,
        status=ContentEntry.Status.PUBLISHED,
        content_type__is_public=True,
        content_type=entry.content_type,
    ).exclude(pk=entry.pk)[:4]

    chain = []
    current = entry
    seen = set()
    while current and current.pk not in seen:
        seen.add(current.pk)
        chain.append({"title": current.title, "path": current.path})
        current = current.parent

    return Response({
        "preview": bool(preview_token),
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
    entries = ContentEntry.objects.filter(
        site=site,
        status=ContentEntry.Status.PUBLISHED,
        content_type__is_public=True,
    ).exclude(seo_meta__robots_index=False).order_by("path")
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
