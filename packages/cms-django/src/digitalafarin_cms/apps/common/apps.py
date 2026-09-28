from django.apps import AppConfig


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "digitalafarin_cms.apps.common"
    label = "digitalafarin_cms_common"

    def ready(self):
        # Import registers package-level Django system checks.
        import digitalafarin_cms.checks  # noqa: F401
