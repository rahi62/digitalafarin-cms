from django.apps import AppConfig
class ContentConfig(AppConfig):
    default_auto_field="django.db.models.BigAutoField"
    name="digitalafarin_cms.apps.content"
    label = "digitalafarin_cms_content"
    def ready(self):
        from digitalafarin_cms import checks  # noqa: F401
