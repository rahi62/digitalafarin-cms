from celery import shared_task

from . import webhooks


@shared_task(name="digitalafarin_cms.apps.integrations.tasks.deliver_webhook")
def deliver_webhook(delivery_id):
    return webhooks.deliver(delivery_id)


@shared_task(name="digitalafarin_cms.apps.integrations.tasks.drain_webhooks")
def drain_webhooks():
    """Safety net: picks up pending rows whose enqueue was lost (broker outage, restart)."""
    return webhooks.drain()
