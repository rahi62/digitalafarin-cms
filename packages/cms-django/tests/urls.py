from django.urls import include, path

urlpatterns = [
    path("api/cms/v1/", include("digitalafarin_cms.urls")),
]
