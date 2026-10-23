from django.urls import include, path
from django.db import transaction
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from digitalafarin_cms.session_auth import CmsTokenObtainPairSerializer, CmsTokenRefreshSerializer
from digitalafarin_cms.logout import CmsLogoutView
from digitalafarin_cms.login_limits import CmsLoginThrottle
from digitalafarin_cms.user_sessions import (
    CmsSessionListView, CmsSessionRevokeView, CmsSessionRevokeOthersView, CmsSessionRevokeAllView,
)

class CmsObtainPairView(TokenObtainPairView):
    throttle_classes = [CmsLoginThrottle]
    serializer_class = CmsTokenObtainPairSerializer


class CmsRefreshView(TokenRefreshView):
    serializer_class = CmsTokenRefreshSerializer


urlpatterns = [
    path("auth/token/", transaction.non_atomic_requests(CmsObtainPairView.as_view()), name="digitalafarin_cms_token_obtain_pair"),
    path("auth/token/refresh/", CmsRefreshView.as_view(), name="digitalafarin_cms_token_refresh"),
    path("auth/logout/", CmsLogoutView.as_view(), name="digitalafarin_cms_logout"),
    path("auth/sessions/", CmsSessionListView.as_view(), name="cms_user_sessions"),
    path("auth/sessions/revoke-others/", CmsSessionRevokeOthersView.as_view(), name="cms_sessions_revoke_others"),
    path("auth/sessions/revoke-all/", CmsSessionRevokeAllView.as_view(), name="cms_sessions_revoke_all"),
    path("auth/sessions/<uuid:session_id>/revoke/", CmsSessionRevokeView.as_view(), name="cms_session_revoke"),

    path("", include("digitalafarin_cms.apps.sites.urls")),
    path("content/", include("digitalafarin_cms.apps.content.urls")),
    path("seo/", include("digitalafarin_cms.apps.seo.urls")),
    path("media/", include("digitalafarin_cms.apps.media_library.urls")),
    path("audit/", include("digitalafarin_cms.apps.audit.urls")),
    path("integrations/", include("digitalafarin_cms.apps.integrations.urls")),
]
