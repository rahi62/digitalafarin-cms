from django.core.management.base import BaseCommand

from digitalafarin_cms.apps.integrations.webhooks import drain


class Command(BaseCommand):
    help = "Deliver all due webhook deliveries (for hosts that do not run Celery)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=200)

    def handle(self, *args, **options):
        counts = drain(limit=options["limit"])
        self.stdout.write(f"webhook deliveries: {counts or 'none due'}")
