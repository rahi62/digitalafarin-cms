"""Shared login budgets without a cache/Redis dependency."""
from datetime import timedelta
from math import ceil
import json

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import Throttled
from rest_framework.throttling import BaseThrottle

from digitalafarin_cms.apps.sites.models import CmsLoginRateBucket


def login_limits():
    config = {'window': 60, 'ip': 120, 'account': 20, 'pair': 5}
    supplied = getattr(settings, 'DIGITALAFARIN_CMS_LOGIN_LIMITS', {})
    if not isinstance(supplied, dict) or set(supplied) - set(config):
        raise ImproperlyConfigured('Invalid DIGITALAFARIN_CMS_LOGIN_LIMITS keys.')
    config.update(supplied)
    if any(type(value) is not int or not 1 <= value <= 3600 for value in config.values()):
        raise ImproperlyConfigured('CMS login limits must be integers between 1 and 3600.')
    return config


class CmsLoginThrottle(BaseThrottle):
    def allow_request(self, request, view):
        config = login_limits()
        # Do not trust caller-controlled X-Forwarded-For/Forwarded headers.
        address = request.META.get('REMOTE_ADDR') or 'unknown'
        username = request.data.get(get_user_model().USERNAME_FIELD, '') if isinstance(request.data, dict) else ''
        username = username.strip().casefold() if isinstance(username, str) else ''
        identifiers = {
            json.dumps(['ip', address]): config['ip'],
            json.dumps(['account', username]): config['account'],
            json.dumps(['pair', address, username]): config['pair'],
        }
        budgets = sorted((salted_hmac('cms.login.limit', value, algorithm='sha256').hexdigest(), limit)
                         for value, limit in identifiers.items())
        with transaction.atomic():
            rows = []
            # Consistent ordering prevents deadlocks between overlapping budgets.
            for key, limit in budgets:
                row, _ = CmsLoginRateBucket.objects.select_for_update().get_or_create(
                    key=key, defaults={'expires_at': timezone.now() + timedelta(seconds=config['window'])},
                )
                rows.append((row, limit))
            now = timezone.now()  # Fresh time after any lock waits.
            waits = []
            for row, limit in rows:
                if row.expires_at <= now:
                    row.attempts = 0
                    row.expires_at = now + timedelta(seconds=config['window'])
                if row.attempts >= limit:
                    waits.append(ceil((row.expires_at - now).total_seconds()))
            if waits:
                # Roll back any newly created buckets for a denied request.
                raise Throttled(wait=max(1, max(waits)))
            for row, _ in rows:
                row.attempts += 1
                row.save(update_fields=['attempts', 'expires_at'])
        # Count admitted attempts, including successes; never reset shared address
        # budgets after one successful login or attackers could erase the limit.
        return True
