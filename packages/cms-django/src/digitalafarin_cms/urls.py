from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from digitalafarin_cms.session_auth import CmsTokenObtainPairSerializer, CmsTokenRefreshSerializer
from digitalafarin_cms.logout import CmsLogoutView

urlpatterns = [
    path("auth/token/", TokenObtainPairView.as_view(), name="digitalafarin_cms_token_obtain_pair"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="digitalafarin_cms_token_refresh"),
    path("auth/logout/", CmsLogoutView.as_view(), name="digitalafarin_cms_logout"),
    path("", include("digitalafarin_cms.apps.sites.urls")),
    path("content/", include("digitalafarin_cms.apps.content.urls")),
    path("seo/", include("digitalafarin_cms.apps.seo.urls")),
    path("media/", include("digitalafarin_cms.apps.media_library.urls")),
    path("audit/", include("digitalafarin_cms.apps.audit.urls")),
    path("integrations/", include("digitalafarin_cms.apps.integrations.urls")),
]
