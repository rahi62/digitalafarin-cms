"""CMS authentication boundary, independent of host DRF authenticator choices."""
from collections.abc import Mapping

from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import Token

from digitalafarin_cms.session_auth import managed_session


class CmsIsAuthenticated(IsAuthenticated):
    """Check verified session claims again before any protected CMS handler runs.

    Host authenticators remain responsible for credential validation. Never decode
    raw bearer headers here: only inspect their already authenticated result.
    Compatibility mode retains host session/non-JWT authentication; strict mode
    requires a managed CMS session for every protected request.
    """

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        claims = request.auth if isinstance(request.auth, (Token, Mapping)) else {}
        managed_session(claims, user_id=request.user.pk)
        return True
