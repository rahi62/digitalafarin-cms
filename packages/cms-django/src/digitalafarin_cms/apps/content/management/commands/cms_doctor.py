from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.urls import resolve, Resolver404


class Command(BaseCommand):
    help = "Check host routing, migrations, Wagtail compatibility and CMS media configuration."

    def handle(self, **options):
        failures = []
        prefix = "/" + getattr(settings, "DIGITALAFARIN_CMS_API_PREFIX", "api/cms/v1/").strip("/")
        try:
            match = resolve(prefix + "/content/public-entries/")
            if not match.func.__module__.startswith("digitalafarin_cms"):
                failures.append("CMS API is shadowed by a host catch-all. Put the CMS include before Wagtail/page routes.")
        except Resolver404:
            failures.append("CMS public-entries URL is not installed at DIGITALAFARIN_CMS_API_PREFIX.")
        executor = MigrationExecutor(connection)
        pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
        for migration, _ in pending:
            if migration.app_label.startswith(("digitalafarin_cms", "wagtail")):
                failures.append(f"Unapplied migration: {migration.app_label}.{migration.name}")
        if any(config.name.startswith("wagtail") for config in apps.get_app_configs()):
            if "wagtailcore_site" not in connection.introspection.table_names():
                failures.append("Missing wagtailcore_site. Run Wagtail migrations if used, or remove its apps/middleware if unused. This is independent of CMS media routing.")
        self.stdout.write("Public media base: " + (getattr(settings, "DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL", "") or getattr(settings, "MEDIA_URL", "/media/")))
        self.stdout.write("Same-origin /media/ needs a web server or Next fixed-upstream media handler. Django does not serve production uploads automatically.")
        if failures:
            raise CommandError("\n".join(failures))
        self.stdout.write(self.style.SUCCESS("CMS host checks passed. Verify public pages and media over HTTP before deployment."))
