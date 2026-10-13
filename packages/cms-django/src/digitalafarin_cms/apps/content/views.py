from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from xml.sax.saxutils import escape as xml_escape
from rest_framework import status as drf_status, viewsets, serializers
from rest_framework.decorators import action, api_view, permission_classes, authentication_classes
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
from .models import Category, ContentEntry, ContentRevision, ContentTypeDefinition, Menu, PublishedEntry, ReusableBlock, Tag
from .serializers import CategorySerializer, ContentEntrySerializer, ContentRevisionSerializer, ContentTypeSerializer, MenuSerializer, ReusableBlockSerializer, TagSerializer
from .services import create_revision
from .field_schema import find_breaking_schema_changes, validate_schema_fields, relation_targets
from .relations import find_relation_uses
from .trash import move_to_trash, restore_from_trash
from .schema_migration import preview_field_rename, execute_field_rename
from .routing import normalize_path
from .public import PublicEntrySerializer, public_entries, published_content
from digitalafarin_cms.media import normalize_media_data


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

    @action(detail=True, methods=["get"], url_path="singleton-entry")
    def singleton_entry(self, request, pk=None):
        content_type = self.get_object()
        if content_type.kind != ContentTypeDefinition.Kind.SINGLETON:
            return Response({"detail": "This content type is a collection."}, status=400)
        record = ContentEntry.objects.filter(content_type=content_type).first()
        return Response({
            "exists": record is not None,
            "entry_id": str(record.pk) if record else None,
            "title": record.title if record else None,
            "path": record.path if record else None,
            "trashed": record.deleted_at is not None if record else False,
        })

    def perform_destroy(self, instance):
        if instance.entries.exists():
            raise serializers.ValidationError({
                "content_type": "This content type contains entries; export or migrate them before removal."
            })
        dependencies = [
            item.slug for item in ContentTypeDefinition.objects.filter(
                site_id=instance.site_id
            ).exclude(pk=instance.pk).only("slug", "schema")
            if instance.slug in relation_targets((item.schema or {}).get("fields", []))
        ]
        if dependencies:
            raise serializers.ValidationError({
                "content_type": "Other content types reference this type.",
                "referenced_by": dependencies[:10],
            })
        instance.delete()

    @action(detail=True, methods=["post"], url_path="schema-rename")
    def schema_rename(self, request, pk=None):
        content_type = self.get_object()
        ensure_organization_roles(
            request.user, content_type.site.organization_id,
            (Membership.Role.OWNER, Membership.Role.ADMIN),
            "Only Owner and Admin can run schema migrations.",
        )
        source = request.data.get("source_key")
        destination = request.data.get("destination_key")
        if request.data.get("mode") == "preview":
            return Response(preview_field_rename(content_type, source, destination))
        if request.data.get("mode") != "execute" or request.data.get("confirm") is not True:
            raise serializers.ValidationError({"confirm": "Explicit confirmation is required."})
        result = execute_field_rename(
            content_type, source, destination, request.data.get("preview_token"), request.user,
        )
        return Response(result)

    @action(detail=True, methods=["post"], url_path="schema-impact")
    def schema_impact(self, request, pk=None):
        """Dry-run a field schema edit; never mutate content or schema here."""
        entry_type = self.get_object()  # TenantScopedViewSetMixin enforces write role for POST.
        schema = request.data.get("schema")
        if not isinstance(schema, dict):
            return Response({"schema": "Expected a schema object."}, status=400)
        try:
            validate_schema_fields(schema.get("fields", []))
        except serializers.ValidationError as exc:
            return Response({"schema": exc.detail}, status=400)
        for target_slug in relation_targets(schema.get("fields", [])):
            if target_slug != entry_type.slug and not ContentTypeDefinition.objects.filter(
                site_id=entry_type.site_id, slug=target_slug,
            ).exists():
                return Response({"schema": "Related content type does not exist in this site: " + target_slug}, status=400)
        count = entry_type.entries.count()
        warnings = find_breaking_schema_changes(
            (entry_type.schema or {}).get("fields", []),
            schema.get("fields", []),
        ) if count else []
        samples = list(entry_type.entries.order_by("created_at").values("id", "title")[:5])
        return Response({
            "safe": not warnings,
            "affected_entries": count,
            "warnings": warnings,
            "sample_entries": [{"id": str(row["id"]), "title": row["title"]} for row in samples],
            "note": "Read-only dry-run. A breaking schema requires an explicit data migration.",
        })


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

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, "action", None) in {"restore", "trashed"}:
            return queryset.filter(deleted_at__isnull=False)
        return queryset.filter(deleted_at__isnull=True)

    def perform_destroy(self, instance):
        if instance.status in PROTECTED_STATUSES or PublishedEntry.objects.filter(entry_id=instance.pk).exists():
            _require_publisher(self.request.user, instance)
        move_to_trash(instance, self.request.user)

    @action(detail=True, methods=["post"], url_path="trash")
    def trash(self, request, pk=None):
        entry = self.get_object()
        self.perform_destroy(entry)
        return Response({"id": str(entry.pk), "trashed": True, "restorable": True})

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        entry = self.get_object()
        restored = restore_from_trash(entry, request.user)
        return Response(self.get_serializer(restored).data)

    @action(detail=False, methods=["get"], url_path="trashed")
    def trashed(self, request):
        queryset = self.filter_queryset(self.get_queryset()).order_by("-deleted_at", "-created_at")
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["post"], url_path="path-preview")
    def path_preview(self, request):
        instance = None
        if request.data.get("id"):
            from django.shortcuts import get_object_or_404
            instance = get_object_or_404(self.get_queryset(), pk=request.data["id"])
        serializer = self.get_serializer(instance, data=request.data, partial=bool(instance))
        serializer.is_valid(raise_exception=True)
        self.validate_tenant_serializer(serializer, require_write=True)
        return Response({"path": serializer.validated_data["path"], "path_mode": serializer.validated_data["path_mode"]})

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
        if requested_status != entry.status and (
            requested_status in PROTECTED_STATUSES or entry.status in PROTECTED_STATUSES
        ):
            raise PermissionDenied("Use the editorial workflow to change a published or scheduled state.")

        saved = serializer.save()
        is_autosave = self.request.headers.get("X-CMS-Autosave") == "1"
        create_revision(saved, self.request.user, "Updated", coalesce_autosave=is_autosave)

    @action(detail=True, methods=["get"])
    def workflow(self, request, pk=None):
        entry = self.get_object()
        role = organization_role(request.user, entry.site.organization_id)
        can_publish = _publisher(request.user, entry)
        live = PublishedEntry.objects.filter(entry=entry).first()
        edited = False
        if live:
            from .publication import capture_publication
            current, current_seo, current_schemas, _, _ = capture_publication(entry)
            relevant = ("title", "slug", "path", "excerpt", "blocks", "custom_fields",
                        "parent", "categories", "tags", "is_featured")
            edited = any(current.get(key) != live.payload.get(key) for key in relevant)
            if not edited:
                ignored_seo = {"created_at", "updated_at", "analysis", "seo_score"}
                clean = lambda value: {k: v for k, v in value.items() if k not in ignored_seo}
                edited = clean(current_seo) != clean(live.seo)
            if not edited:
                reduced = lambda value: [(row.get("schema_type"), row.get("data"))
                                         for row in value]
                edited = reduced(current_schemas) != reduced(live.schemas)
        return Response({
            "has_live_version": live is not None,
            "has_unpublished_changes": edited,
            "live_path": live.path if live else None,
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
        with transaction.atomic():
            entry.status = ContentEntry.Status.DRAFT
            entry.scheduled_at = None
            entry.save(update_fields=["status", "scheduled_at", "updated_at"])
            PublishedEntry.objects.filter(entry=entry).delete()
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
            {"entry_id": str(entry.pk), "site_id": str(entry.site_id), "path": entry.path},
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

        restore_data = {key: snapshot[key] for key in ["title", "slug", "path", "path_mode", "excerpt", "blocks", "custom_fields", "status", "is_featured"] if key in snapshot}
        restore_data.setdefault("path_mode", "manual")
        serializer = self.get_serializer(entry, data=restore_data, partial=True)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save()

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
@authentication_classes([])
@permission_classes([AllowAny])
def resolve_path(request):
    response = _resolve_path(request)
    response["Cache-Control"] = "private, no-store" if "preview" in request.query_params else "no-store"
    if "preview" in request.query_params:
        response["X-Robots-Tag"] = "noindex, nofollow"
        response["Referrer-Policy"] = "no-referrer"
    return response


def _resolve_path(request):
    domain = request.query_params.get("site")
    path = request.query_params.get("path", "/")
    preview_token = request.query_params.get("preview", "")
    if not domain:
        return Response({"detail": "site query parameter is required"}, status=400)
    raw_path = path
    try:
        path = normalize_path(path)
    except ValidationError:
        return Response({"detail": "Content not found"}, status=404)
    try:
        site = Site.objects.get(domain=domain, is_active=True)
    except Site.DoesNotExist:
        return Response({"detail": "Site not found"}, status=404)

    if "preview" in request.query_params:
        try:
            payload = signing.loads(preview_token, salt=PREVIEW_SALT, max_age=preview_max_age())
        except signing.SignatureExpired:
            return Response({"detail": "Preview token expired"}, status=403)
        except signing.BadSignature:
            return Response({"detail": "Invalid preview token"}, status=403)
        if not isinstance(payload, dict) or str(payload.get("site_id")) != str(site.pk):
            return Response({"detail": "Preview token does not match this site"}, status=403)
        try:
            signed_path = normalize_path(payload.get("path"))
        except ValidationError:
            signed_path = None
        if signed_path != path:
            return Response({"detail": "Preview token does not match this path; create a new preview link"}, status=403)
        try:
            entry = ContentEntry.objects.select_related("content_type", "author", "parent").prefetch_related("categories", "tags").get(
                pk=payload.get("entry_id"),
                site=site,
                path=payload["path"],
            )
        except ContentEntry.DoesNotExist:
            return Response({"detail": "Preview content not found"}, status=404)
    else:
        try:
            published = public_entries(site).select_related("site", "content_type").filter(
                Q(path=path) | Q(path=raw_path) | Q(path=path.rstrip("/") or "/")
            ).order_by("path").first()
            if published is None:
                # Compatibility with NFD/encoded URLs, without mutating legacy published paths.
                for item in public_entries(site).select_related("site", "content_type").iterator():
                    try:
                        matches = normalize_path(item.path) == path
                    except ValidationError:
                        matches = False
                    if matches:
                        published = item
                        break
            if published is None:
                raise ContentEntry.DoesNotExist
        except ContentEntry.DoesNotExist:
            return Response({"detail": "Content not found"}, status=404)

    related = public_entries(site).filter(
        content_type_id=(entry.content_type_id if "preview" in request.query_params else published.content_type_id),
    )
    if "preview" in request.query_params:
        related = related.exclude(entry_id=entry.pk)
    else:
        related = related.exclude(pk=published.pk)
    related = related.order_by("-published_at")[:4]
    chain = []
    seen = set()

    if "preview" in request.query_params:
        seo = SeoMeta.objects.filter(entry=entry).first()
        schemas = SchemaMarkup.objects.filter(entry=entry, is_active=True)
        current = entry
        while current and current.pk not in seen:
            seen.add(current.pk)
            if current.site_id != site.id:
                break
            if current.pk == entry.pk or (current.status == ContentEntry.Status.PUBLISHED and current.content_type.is_public):
                chain.append({"title": current.title, "path": current.path})
            current = current.parent
        content = ContentEntrySerializer(entry).data
        blocks = normalize_media_data(entry.blocks)
        seo_data = normalize_media_data(SeoMetaSerializer(seo).data) if seo else None
        schema_data = SchemaMarkupSerializer(schemas, many=True).data
    else:
        current = published
        while current and current.entry_id not in seen:
            seen.add(current.entry_id)
            chain.append({"title": current.title, "path": current.path})
            parent_id = current.payload.get("parent")
            current = public_entries(site).filter(entry_id=parent_id).first() if parent_id else None
        content = published_content(published)
        blocks = normalize_media_data(published.payload.get("blocks", []))
        seo_data = normalize_media_data(published.seo) if published.seo else None
        schema_data = normalize_media_data(published.schemas)

    return Response({
        "preview": "preview" in request.query_params,
        "site": {"name": site.name, "domain": site.domain, "language": site.default_language},
        "content": content,
        "blocks": blocks,
        "seo": seo_data,
        "schemas": schema_data,
        "breadcrumbs": list(reversed(chain)),
        "related_content": [
            {
                "id": str(item.entry_id), "title": item.title,
                "path": item.path, "excerpt": item.excerpt,
            } for item in related
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
    entries = public_entries(site).filter(is_indexable=True).order_by("path")
    base = frontend_base_for(site)
    rows = [
        f"<url><loc>{xml_escape(base + entry.path)}</loc><lastmod>{entry.published_at.date().isoformat()}</lastmod></url>"
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
