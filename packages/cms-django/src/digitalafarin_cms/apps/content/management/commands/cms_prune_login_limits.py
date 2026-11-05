from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from digitalafarin_cms.apps.sites.models import CmsLoginRateBucket


class Command(BaseCommand):
    help = 'Preview or remove a bounded batch of expired CMS login rate-limit buckets.'

    def add_arguments(self, parser):
        parser.add_argument('--execute', action='store_true')
        parser.add_argument('--limit', type=int, default=1000)

    def handle(self, *args, **options):
        limit = options['limit']
        if not 1 <= limit <= 10000:
            raise CommandError('--limit must be between 1 and 10000.')
        now = timezone.now()
        keys = list(CmsLoginRateBucket.objects.filter(expires_at__lte=now)
                    .order_by('expires_at', 'key').values_list('key', flat=True)[:limit])
        if not options['execute']:
            self.stdout.write(f'Dry run: {len(keys)} expired buckets selected; no changes made.')
            return
        # Recheck expiry at deletion so a concurrently renewed bucket survives.
        count, _ = CmsLoginRateBucket.objects.filter(key__in=keys, expires_at__lte=now).delete()
        self.stdout.write(f'Removed {count} expired login rate-limit buckets.')
