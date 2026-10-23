"""Blacklists the supplied refresh token; never trust client-provided identity."""
from rest_framework import serializers, status
from digitalafarin_cms.permissions import CmsIsAuthenticated as IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from digitalafarin_cms.apps.sites.models import CmsUserSession
from digitalafarin_cms.session_auth import SESSION_CLAIM


class CmsLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("refresh")
        if not isinstance(token, str) or not token:
            raise serializers.ValidationError({"refresh": "Refresh token is required."})
        try:
            refresh = RefreshToken(token)
            if str(refresh["user_id"]) != str(request.user.pk):
                raise serializers.ValidationError({"refresh": "Refresh token does not belong to this user."})
            access_sid = request.auth.get(SESSION_CLAIM) if request.auth else None
            refresh_sid = refresh.get(SESSION_CLAIM)
            if access_sid and refresh_sid != access_sid:
                raise serializers.ValidationError({"refresh": "Refresh belongs to another session."})
            refresh.blacklist()
            if refresh_sid:
                CmsUserSession.objects.filter(
                    pk=refresh_sid, user=request.user, revoked_at__isnull=True,
                ).update(revoked_at=timezone.now(), updated_at=timezone.now())
        except TokenError:
            raise serializers.ValidationError({"refresh": "Refresh token is invalid or already revoked."})
        return Response(status=status.HTTP_204_NO_CONTENT)
