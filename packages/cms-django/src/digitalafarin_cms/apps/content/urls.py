from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ContentTypeViewSet, ContentEntryViewSet, ContentRevisionViewSet, CategoryViewSet, TagViewSet, ReusableBlockViewSet, MenuViewSet, resolve_path, sitemap, robots_txt
from .menu_views import MenuItemViewSet

router=DefaultRouter()
router.register("types",ContentTypeViewSet)
router.register("entries",ContentEntryViewSet)
router.register("revisions",ContentRevisionViewSet)
router.register("categories",CategoryViewSet)
router.register("tags",TagViewSet)
router.register("reusable-blocks",ReusableBlockViewSet)
router.register("menus",MenuViewSet)
router.register("menu-items",MenuItemViewSet)

urlpatterns=[path("resolve/",resolve_path),path("sitemap/",sitemap),path("robots/",robots_txt),path("",include(router.urls))]
