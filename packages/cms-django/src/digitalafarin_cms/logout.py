"""Blacklists the supplied refresh token; never trust client-provided identity."""
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken


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
            refresh.blacklist()
        except TokenError:
            raise serializers.ValidationError({"refresh": "Refresh token is invalid or already revoked."})
        return Response(status=status.HTTP_204_NO_CONTENT)
