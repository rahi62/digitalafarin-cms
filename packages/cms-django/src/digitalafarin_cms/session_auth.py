"""Session-bound CMS JWT tokens, including immediate server-side access denial.

Host projects overriding REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES must include
CmsSessionJWTAuthentication for the revocation guarantee on all CMS views.
"""
from datetime import datetime, timedelta, timezone as dt_timezone
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer

from digitalafarin_cms.apps.sites.models import CmsUserSession

SESSION_CLAIM = "cms_sid"


def managed_session(token, *, user_id=None, lock=False):
    raw = token.get(SESSION_CLAIM)
    if not raw:
        if getattr(settings, "DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS", False):
            raise AuthenticationFailed("CMS session is required.")
        return None
    try:
        session_id = UUID(str(raw))
    except (TypeError, ValueError, AttributeError):
        raise AuthenticationFailed("Invalid CMS session.")
    query = CmsUserSession.objects.filter(
        pk=session_id, revoked_at__isnull=True,
        refresh_expires_at__gt=timezone.now(),
    )
    if lock:
        query = query.select_for_update()
    actual_user = user_id if user_id is not None else token.get("user_id")
    if not actual_user:
        raise AuthenticationFailed("Session identity is missing.")
    session = query.filter(user_id=actual_user).first()
    # The query may have waited on a lock past the cutoff computed above.
    if session is None or session.revoked_at is not None or session.refresh_expires_at <= timezone.now():
        raise AuthenticationFailed("CMS session was revoked or expired.")
    return session


class CmsSessionJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        session = managed_session(validated_token, user_id=user.pk)
        if session is not None:
            threshold = timezone.now() - timedelta(minutes=5)
            if not session.last_seen_at or session.last_seen_at < threshold:
                CmsUserSession.objects.filter(
                    pk=session.pk, revoked_at__isnull=True,
                    last_seen_at=session.last_seen_at,
                ).update(last_seen_at=timezone.now())
        return user


class CmsTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        refresh = super().get_token(user)
        session = CmsUserSession.objects.create(
            user=user,
            refresh_expires_at=datetime.fromtimestamp(int(refresh["exp"]), tz=dt_timezone.utc),
            last_seen_at=timezone.now(),
        )
        refresh[SESSION_CLAIM] = str(session.pk)
        return refresh

    def validate(self, attrs):
        response = super().validate(attrs)
        request = self.context.get("request")
        if request is not None:
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken(response["refresh"])
            CmsUserSession.objects.filter(
                pk=refresh.get(SESSION_CLAIM), user=self.user,
            ).update(user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:255])
        return response


class CmsTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        token = self.token_class(attrs["refresh"])
        with transaction.atomic():
            # All API instances serialize on the same session row. The parent
            # serializer revalidates the blacklist after acquiring this lock,
            # so a waiter cannot rotate the same already-consumed refresh JWT.
            managed_session(token, lock=True)
            return super().validate(attrs)
