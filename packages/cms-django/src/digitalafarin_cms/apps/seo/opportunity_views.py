from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from digitalafarin_cms.apps.common.tenancy import ensure_organization_access
from digitalafarin_cms.apps.sites.models import Site
from .intelligence import build_seo_opportunities


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def seo_opportunities(request):
    site_id = request.query_params.get("site")
    if not site_id:
        return Response({"detail": "site query parameter is required"}, status=400)

    try:
        site = Site.objects.select_related("organization").get(pk=site_id)
    except (Site.DoesNotExist, DjangoValidationError, ValueError):
        return Response({"detail": "Site not found"}, status=404)

    ensure_organization_access(request.user, site.organization_id)

    try:
        current_days = int(request.query_params.get("current_days", 28))
        min_impressions = int(request.query_params.get("min_impressions", 100))
        limit = int(request.query_params.get("limit", 100))
    except (TypeError, ValueError):
        return Response({"detail": "current_days, min_impressions and limit must be integers"}, status=400)

    include_low = request.query_params.get("include_low", "").lower() in {"1", "true", "yes"}
    payload = build_seo_opportunities(
        site,
        current_days=current_days,
        min_impressions=min_impressions,
        include_low=include_low,
        limit=limit,
    )
    return Response(payload)
