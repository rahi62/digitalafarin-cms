"""Exercise upgrade with pre-0.7 rows in an isolated in-memory database."""
from pathlib import Path
import os
import sys

root = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(root / "packages/cms-django/src"), str(root / "packages/cms-django")]
os.environ["DJANGO_SETTINGS_MODULE"] = "tests.settings"
import django
django.setup()
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

old = [("digitalafarin_cms_content", "0001_initial")]
executor = MigrationExecutor(connection)
executor.migrate(old)
historical = executor.loader.project_state(old).apps
Organization = historical.get_model("digitalafarin_cms_sites", "Organization")
Site = historical.get_model("digitalafarin_cms_sites", "Site")
Type = historical.get_model("digitalafarin_cms_content", "ContentTypeDefinition")
Entry = historical.get_model("digitalafarin_cms_content", "ContentEntry")
org = Organization.objects.create(name="Migration", slug="migration")
site = Site.objects.create(organization=org, name="Migration", domain="migration.test")
kind = Type.objects.create(site=site, name="Post", slug="post")
entry = Entry.objects.create(site=site, content_type=kind, title="Existing", slug="existing", path="/custom/%D9%85", status="published")
executor = MigrationExecutor(connection)
executor.migrate(executor.loader.graph.leaf_nodes())
from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition
updated = ContentEntry.objects.get(pk=entry.pk)
assert updated.path == "/custom/%D9%85"
assert updated.path_mode == "manual"
assert ContentTypeDefinition.objects.get(pk=kind.pk).entry_path_pattern == ""
updated.title = "Ordinary edit"
updated.save()
updated.refresh_from_db()
assert updated.path == "/custom/%D9%85"
print("0.6 -> 0.7 migration preserves existing encoded/custom paths and manual routing.")
