"""Public content reads only published snapshots, never mutable editor fields."""
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import serializers

from digitalafarin_cms.media import normalize_media_data
from digitalafarin_cms.apps.sites.models import Site
from .models import PublishedEntry


def public_entries(site):
    return PublishedEntry.objects.filter(
        site=site, site__is_active=True, site__organization__is_active=True,
        content_type__site=site, content_type__is_public=True,
    )


def published_content(item):
    """Retain the resolver's established content shape and same-origin media resolution."""
    from .views import frontend_base_for
    content = dict(item.payload)
    content["url"] = frontend_base_for(item.site) + item.path
    return normalize_media_data(content)


class PublicEntrySerializer(serializers.BaseSerializer):
    def to_representation(self, item):
        payload = item.payload
        fields = (
            "id", "title", "slug", "path", "excerpt", "status", "blocks", "custom_fields",
            "content_type_slug", "published_at", "updated_at", "is_featured",
        )
        result = {key: payload.get(key) for key in fields}
        result["url"] = published_content(item)["url"]
        result["categories"] = payload.get("category_details", [])
        result["tags"] = payload.get("tag_details", [])
        return normalize_media_data(result)


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

    entries = public_entries(site).select_related("site", "content_type")
    if kind := request.query_params.get("content_type"):
        entries = entries.filter(payload__content_type_slug=kind)
    if search := request.query_params.get("search"):
        entries = entries.filter(Q(title__icontains=search) | Q(excerpt__icontains=search))

    category = request.query_params.get("category")
    tag = request.query_params.get("tag")
    if category or tag:
        # JSON array containment is not supported by all installed Django DBs.
        # Filter frozen category/tag slugs, never the mutable editorial relations.
        valid_ids = [
            pk for pk, categories, tags in entries.values_list(
                "pk", "category_slugs", "tag_slugs"
            ).iterator() if (not category or category in categories) and (not tag or tag in tags)
        ]
        entries = entries.filter(pk__in=valid_ids)

    entries = entries.order_by("-published_at", "-created_at", "id")
    count = entries.count()
    offset = (page - 1) * size
    if page > 1 and offset >= count:
        return Response({"detail": "Page not found"}, status=404)
    response = Response({
        "count": count, "page": page, "page_size": size,
        "next": page + 1 if offset + size < count else None,
        "previous": page - 1 if page > 1 else None,
        "results": PublicEntrySerializer(entries[offset:offset + size], many=True).data,
    })
    response["Cache-Control"] = "no-store"
    return response
