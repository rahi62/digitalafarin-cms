from django.core.management.base import BaseCommand

from digitalafarin_cms.apps.content.tasks import publish_due


class Command(BaseCommand):
    help = "Publish scheduled content whose time has come (for hosts that use cron instead of Celery Beat)."

    def handle(self, *args, **options):
        self.stdout.write(f"published {publish_due()} scheduled entries")
