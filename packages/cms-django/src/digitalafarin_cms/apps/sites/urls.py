from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MembershipViewSet, OrganizationViewSet, SiteViewSet, public_site_context_view

router = DefaultRouter()
router.register("organizations", OrganizationViewSet)
router.register("sites", SiteViewSet)
router.register("memberships", MembershipViewSet)

urlpatterns = [path("site-context/", public_site_context_view)] + router.urls
