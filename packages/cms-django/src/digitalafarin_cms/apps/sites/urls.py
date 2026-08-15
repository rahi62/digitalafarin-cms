from rest_framework.routers import DefaultRouter
from .views import OrganizationViewSet, SiteViewSet, MembershipViewSet
router=DefaultRouter(); router.register("organizations",OrganizationViewSet); router.register("sites",SiteViewSet); router.register("memberships",MembershipViewSet)
urlpatterns=router.urls
