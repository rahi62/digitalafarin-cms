from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from digitalafarin_cms.apps.seo.models import Redirect
from digitalafarin_cms.apps.sites.models import Site

from . import webhooks


def _redirect_changed(instance):
    if webhooks.suppress_redirect_events.get():
        return  # emitted as part of a publish (content.published already lists the paths)
    paths = [path for path in (instance.source_path, instance.destination_path) if path]
    webhooks.emit_event(instance.site, "redirect.changed", {"paths": paths, "source_path": instance.source_path})


@receiver(post_save, sender=Redirect, dispatch_uid="cms_webhook_redirect_saved")
def redirect_saved(sender, instance, **kwargs):
    _redirect_changed(instance)


@receiver(post_delete, sender=Redirect, dispatch_uid="cms_webhook_redirect_deleted")
def redirect_deleted(sender, instance, **kwargs):
    if Site.objects.filter(pk=instance.site_id).exists():
        _redirect_changed(instance)


@receiver(post_save, sender=Site, dispatch_uid="cms_webhook_site_saved")
def site_saved(sender, instance, created, **kwargs):
    if not created:
        webhooks.emit_event(instance, "site.settings_changed", {})
