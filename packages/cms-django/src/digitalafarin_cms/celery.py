"""Optional Celery Beat settings for scheduled publishing."""

BEAT_SCHEDULE = {
    "digitalafarin-cms-publish-due-content": {
        "task": "digitalafarin_cms.apps.content.tasks.publish_due_entries",
        "schedule": 60.0,
    },
}
