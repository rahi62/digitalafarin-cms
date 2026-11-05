"""Minimal public health probe: database reachable and CMS migrations applied."""
import logging

from django.apps import apps
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from digitalafarin_cms import __version__

logger = logging.getLogger("digitalafarin_cms.health")


def _cms_labels():
    labels = {config.label for config in apps.get_app_configs() if config.name.startswith("digitalafarin_cms")}
    labels.add("token_blacklist")
    return labels


def check_health() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        executor = MigrationExecutor(connection)
        labels = _cms_labels()
        targets = [node for node in executor.loader.graph.leaf_nodes() if node[0] in labels]
        return not executor.migration_plan(targets)
    except Exception as exc:  # never leak details to an anonymous caller
        logger.error("health check failed error=%s", type(exc).__name__)
        return False


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    healthy = check_health()
    response = Response(
        {"status": "ok" if healthy else "unavailable", "version": __version__},
        status=200 if healthy else 503,
    )
    response["Cache-Control"] = "no-store"
    return response
