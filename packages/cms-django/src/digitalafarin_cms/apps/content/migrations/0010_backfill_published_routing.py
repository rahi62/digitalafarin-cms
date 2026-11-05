from django.core.exceptions import ValidationError
from django.db import migrations

BATCH = 500


def backfill(apps, schema_editor):
    from digitalafarin_cms.apps.content.routing import normalize_path

    PublishedEntry = apps.get_model('digitalafarin_cms_content', 'PublishedEntry')
    Term = apps.get_model('digitalafarin_cms_content', 'PublishedEntryTerm')
    seen = {}
    pending, terms = [], []
    for row in PublishedEntry.objects.all().order_by('created_at', 'pk').iterator(chunk_size=BATCH):
        try:
            normalized = normalize_path(row.path, reserved=False)
        except ValidationError:
            normalized = row.path
        key = (row.site_id, normalized)
        if key in seen:
            raise RuntimeError(
                'Two published entries on one site normalize to the same URL '
                f'{normalized!r} (entries {seen[key]} and {row.entry_id}). '
                'Unpublish or move one of them, then run migrate again.'
            )
        seen[key] = row.entry_id
        row.normalized_path = normalized
        row.last_published_at = row.last_published_at or row.published_at
        pending.append(row)
        for slug in dict.fromkeys(row.category_slugs or []):
            terms.append(Term(site_id=row.site_id, published_entry_id=row.pk, kind='category', slug=str(slug)))
        for slug in dict.fromkeys(row.tag_slugs or []):
            terms.append(Term(site_id=row.site_id, published_entry_id=row.pk, kind='tag', slug=str(slug)))
        if len(pending) >= BATCH:
            PublishedEntry.objects.bulk_update(pending, ['normalized_path', 'last_published_at'])
            pending = []
        if len(terms) >= BATCH * 4:
            Term.objects.bulk_create(terms, ignore_conflicts=True)
            terms = []
    if pending:
        PublishedEntry.objects.bulk_update(pending, ['normalized_path', 'last_published_at'])
    if terms:
        Term.objects.bulk_create(terms, ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [('digitalafarin_cms_content', '0009_published_routing_terms')]

    operations = [
        # Reverse is a no-op: the new columns/rows are dropped by reversing 0009.
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
