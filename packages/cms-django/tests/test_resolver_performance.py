"""Indexed resolver lookups and database-side taxonomy filtering."""
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import (
    Category, ContentEntry, ContentTypeDefinition, PublishedEntry, PublishedEntryTerm, Tag,
)
from digitalafarin_cms.apps.content.publication import publish_snapshot
from digitalafarin_cms.apps.sites.models import Organization, Site

BULK = 2000


class ResolverPerformanceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        org = Organization.objects.create(name="Perf", slug="perf")
        cls.site = Site.objects.create(organization=org, name="Perf", domain="perf.example")
        cls.kind = ContentTypeDefinition.objects.create(site=cls.site, name="Post", slug="post")
        now = timezone.now()
        entries = ContentEntry.objects.bulk_create([
            ContentEntry(site=cls.site, content_type=cls.kind, title=f"P{i}", slug=f"p{i}",
                         path=f"/blog/p{i}/", status="published", published_at=now)
            for i in range(BULK)
        ])
        PublishedEntry.objects.bulk_create([
            PublishedEntry(entry=entry, site=cls.site, content_type=cls.kind, path=entry.path,
                           normalized_path=entry.path, title=entry.title, published_at=now,
                           last_published_at=now, payload={"title": entry.title, "blocks": []})
            for entry in entries
        ])

    def resolve(self, path):
        return APIClient().get("/api/cms/v1/content/resolve/", {"site": "perf.example", "path": path})

    def test_miss_is_404_with_bounded_queries_regardless_of_table_size(self):
        self.assertEqual(PublishedEntry.objects.filter(site=self.site).count(), BULK)
        with CaptureQueriesContext(connection) as ctx:
            response = self.resolve("/blog/does-not-exist/")
        self.assertEqual(response.status_code, 404)
        self.assertLessEqual(len(ctx), 3, [q["sql"] for q in ctx.captured_queries])

    def test_hit_uses_bounded_queries(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.resolve("/blog/p1234/")
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(response.data["content"]["title"], "P1234")
        self.assertLessEqual(len(ctx), 8, [q["sql"] for q in ctx.captured_queries])

    def test_missing_trailing_slash_and_duplicate_slashes_resolve_via_normalized_key(self):
        self.assertEqual(self.resolve("/blog/p7").status_code, 200)
        self.assertEqual(self.resolve("/blog//p7/").status_code, 200)

    def test_normalized_path_is_unique_per_site(self):
        from django.db import IntegrityError, transaction
        first, second = PublishedEntry.objects.filter(site=self.site).order_by("path")[:2]
        with self.assertRaises(IntegrityError), transaction.atomic():
            PublishedEntry.objects.filter(pk=second.pk).update(normalized_path=first.normalized_path)


class TaxonomyFilterTests(TestCase):
    def setUp(self):
        org = Organization.objects.create(name="Tax", slug="tax")
        self.site = Site.objects.create(organization=org, name="Tax", domain="tax.example")
        self.kind = ContentTypeDefinition.objects.create(site=self.site, name="Post", slug="post")
        self.news = Category.objects.create(site=self.site, name="News", slug="news")
        self.guides = Category.objects.create(site=self.site, name="Guides", slug="guides")
        self.seo = Tag.objects.create(site=self.site, name="SEO", slug="seo")
        self.ads = Tag.objects.create(site=self.site, name="Ads", slug="ads")
        self.entries = {}
        spec = {"a": ([self.news], [self.seo]), "b": ([self.news], [self.ads]), "c": ([self.guides], [self.seo])}
        for key, (cats, tags) in spec.items():
            entry = ContentEntry.objects.create(
                site=self.site, content_type=self.kind, title=key.upper(), slug=key, path=f"/{key}/",
                status="published")
            entry.categories.set(cats)
            entry.tags.set(tags)
            publish_snapshot(entry)
            self.entries[key] = entry

    def listing(self, **params):
        return APIClient().get("/api/cms/v1/content/public-entries/", {"site": "tax.example", **params})

    def titles(self, **params):
        return sorted(item["title"] for item in self.listing(**params).data["results"])

    def test_publish_populates_indexed_terms(self):
        rows = set(PublishedEntryTerm.objects.values_list("published_entry__entry__slug", "kind", "slug"))
        self.assertIn(("a", "category", "news"), rows)
        self.assertIn(("c", "tag", "seo"), rows)
        self.assertEqual(len(rows), 6)

    def test_category_tag_and_combined_filters(self):
        self.assertEqual(self.titles(category="news"), ["A", "B"])
        self.assertEqual(self.titles(tag="seo"), ["A", "C"])
        self.assertEqual(self.titles(category="news", tag="seo"), ["A"])
        self.assertEqual(self.titles(category="missing"), [])

    def test_republish_replaces_terms(self):
        entry = self.entries["a"]
        entry.categories.set([self.guides])
        publish_snapshot(entry)
        self.assertEqual(self.titles(category="news"), ["B"])
        self.assertEqual(self.titles(category="guides"), ["A", "C"])

    def test_filter_runs_in_the_database_with_bounded_queries(self):
        with CaptureQueriesContext(connection) as ctx:
            self.listing(category="news", tag="seo")
        self.assertLessEqual(len(ctx), 4, [q["sql"] for q in ctx.captured_queries])
        self.assertTrue(any("publishedentryterm" in q["sql"].lower() for q in ctx.captured_queries))


class PublishedRoutingMigrationTests(TransactionTestCase):
    migrate_from = [("digitalafarin_cms_content", "0008_component_binding_approvals")]
    migrate_to = [("digitalafarin_cms_content", "0011_published_unique_normalized_path")]

    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.migrate(targets)
        executor = MigrationExecutor(connection)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        self.migrate(self.migrate_to)  # leave the schema fully migrated for other tests

    def test_backfill_and_full_reversal(self):
        old = self.migrate(self.migrate_from)
        Org = old.get_model("digitalafarin_cms_sites", "Organization")
        SiteM = old.get_model("digitalafarin_cms_sites", "Site")
        Kind = old.get_model("digitalafarin_cms_content", "ContentTypeDefinition")
        Entry = old.get_model("digitalafarin_cms_content", "ContentEntry")
        Pub = old.get_model("digitalafarin_cms_content", "PublishedEntry")
        org = Org.objects.create(name="M", slug="m")
        site = SiteM.objects.create(organization=org, name="M", domain="m.example")
        kind = Kind.objects.create(site=site, name="Post", slug="post")
        now = timezone.now()
        for slug, path in (("one", "/blog/one"), ("two", "/blog/two/")):
            entry = Entry.objects.create(site=site, content_type=kind, title=slug, slug=slug, path=path, status="published")
            Pub.objects.create(entry=entry, site=site, content_type=kind, path=path, title=slug, published_at=now,
                               category_slugs=["news"], tag_slugs=["seo", "seo"])

        new = self.migrate(self.migrate_to)
        Pub = new.get_model("digitalafarin_cms_content", "PublishedEntry")
        Term = new.get_model("digitalafarin_cms_content", "PublishedEntryTerm")
        self.assertEqual(sorted(Pub.objects.values_list("normalized_path", flat=True)), ["/blog/one/", "/blog/two/"])
        self.assertTrue(all(p.last_published_at == p.published_at for p in Pub.objects.all()))
        self.assertEqual(Term.objects.count(), 4)  # tags de-duplicated

        back = self.migrate(self.migrate_from)  # fully reversible
        self.assertEqual(back.get_model("digitalafarin_cms_content", "PublishedEntry").objects.count(), 2)
