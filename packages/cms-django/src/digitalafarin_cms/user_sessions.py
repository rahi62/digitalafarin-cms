"""Authenticated session inventory and immediate server-side revocation."""
from uuid import UUID

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from digitalafarin_cms.apps.sites.models import CmsUserSession
from digitalafarin_cms.session_auth import SESSION_CLAIM


def current_session_id(request):
    token = getattr(request, "auth", None)
    value = token.get(SESSION_CLAIM) if token else None
    try:
        return UUID(str(value)) if value else None
    except (TypeError, ValueError):
        return None


def payload(request, session):
    now = timezone.now()
    return {
        "id": str(session.pk),
        "current": session.pk == current_session_id(request),
        "created_at": session.created_at.isoformat(),
        "last_seen_at": session.last_seen_at.isoformat() if session.last_seen_at else None,
        "expires_at": session.refresh_expires_at.isoformat(),
        "revoked_at": session.revoked_at.isoformat() if session.revoked_at else None,
        "active": session.revoked_at is None and session.refresh_expires_at > now,
        "device": session.user_agent or "Unknown browser",
    }


class CmsSessionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = CmsUserSession.objects.filter(user=request.user).order_by("-created_at")[:50]
        return Response({
            "current_session_id": str(current_session_id(request)) if current_session_id(request) else None,
            "results": [payload(request, session) for session in sessions],
        })


class CmsSessionRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id):
        with transaction.atomic():
            session = CmsUserSession.objects.select_for_update().filter(
                pk=session_id, user=request.user,
            ).first()
            if session is None:
                return Response({"detail": "Session not found."}, status=404)
            if session.revoked_at is None:
                session.revoked_at = timezone.now()
                session.save(update_fields=["revoked_at", "updated_at"])
        return Response({"revoked": str(session.pk), "current_revoked": session.pk == current_session_id(request)})


class CmsSessionRevokeOthersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        current = current_session_id(request)
        if current is None:
            raise serializers.ValidationError({"detail": "Sign in again with a managed session first."})
        count = CmsUserSession.objects.filter(
            user=request.user, revoked_at__isnull=True,
        ).exclude(pk=current).update(revoked_at=timezone.now(), updated_at=timezone.now())
        return Response({"revoked_count": count, "current_revoked": False})


class CmsSessionRevokeAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.data.get("confirm") is not True:
            raise serializers.ValidationError({"confirm": "Explicit confirmation is required."})
        if current_session_id(request) is None:
            raise serializers.ValidationError({"detail": "Sign in again with a managed session first."})
        count = CmsUserSession.objects.filter(
            user=request.user, revoked_at__isnull=True,
        ).update(revoked_at=timezone.now(), updated_at=timezone.now())
        return Response({"revoked_count": count, "current_revoked": True})
