from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import serializers

from digitalafarin_cms.media import normalize_media_data
from digitalafarin_cms.apps.sites.models import Site
from .models import ContentEntry


def public_entries(site):
    return ContentEntry.objects.filter(site=site, site__is_active=True, site__organization__is_active=True,
        content_type__site=site, content_type__is_public=True, status=ContentEntry.Status.PUBLISHED)


class PublicEntrySerializer(serializers.ModelSerializer):
    content_type_slug = serializers.CharField(source="content_type.slug", read_only=True)
    url = serializers.SerializerMethodField()
    categories = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()

    class Meta:
        model = ContentEntry
        fields = ["id", "title", "slug", "path", "url", "excerpt", "status", "blocks", "custom_fields",
                  "content_type_slug", "published_at", "updated_at", "is_featured", "categories", "tags"]

    def get_url(self, obj):
        from .views import frontend_base_for
        return frontend_base_for(obj.site) + obj.path

    def get_categories(self, obj):
        return [{"id": str(x.pk), "name": x.name, "slug": x.slug} for x in obj.categories.all() if x.site_id == obj.site_id]

    def get_tags(self, obj):
        return [{"id": str(x.pk), "name": x.name, "slug": x.slug} for x in obj.tags.all() if x.site_id == obj.site_id]

    def to_representation(self, instance):
        return normalize_media_data(super().to_representation(instance))


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def list_public_entries(request):
    domain = request.query_params.get("site")
    if not domain:
        return Response({"detail": "site query parameter is required"}, status=400)
    site = Site.objects.filter(domain=domain, is_active=True).first()
    if not site:
        return Response({"detail": "Site not found"}, status=404)
    try:
        page = int(request.query_params.get("page", 1))
        size = int(request.query_params.get("page_size", 20))
        if page < 1 or not 1 <= size <= 100:
            raise ValueError
    except (ValueError, TypeError):
        return Response({"detail": "page must be positive and page_size must be between 1 and 100"}, status=400)
    entries = public_entries(site).select_related("site", "content_type").prefetch_related("categories", "tags")
    if kind := request.query_params.get("content_type"):
        entries = entries.filter(content_type__slug=kind)
    if search := request.query_params.get("search"):
        entries = entries.filter(Q(title__icontains=search) | Q(excerpt__icontains=search))
    if category := request.query_params.get("category"):
        entries = entries.filter(categories__site=site, categories__slug=category)
    if tag := request.query_params.get("tag"):
        entries = entries.filter(tags__site=site, tags__slug=tag)
    entries = entries.distinct().order_by("-published_at", "-created_at", "id")
    count = entries.count()
    offset = (page - 1) * size
    if page > 1 and offset >= count:
        return Response({"detail": "Page not found"}, status=404)
    response = Response({"count": count, "page": page, "page_size": size,
        "next": page + 1 if offset + size < count else None, "previous": page - 1 if page > 1 else None,
        "results": PublicEntrySerializer(entries[offset:offset + size], many=True).data})
    response["Cache-Control"] = "no-store"
    return response
