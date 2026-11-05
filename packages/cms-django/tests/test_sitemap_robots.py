import re
from datetime import timedelta
from xml.etree import ElementTree

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import serializers
from rest_framework.test import APIClient

from digitalafarin_cms.apps.content.models import ContentEntry, ContentTypeDefinition, PublishedEntry
from digitalafarin_cms.apps.content.publication import publish_snapshot
from digitalafarin_cms.apps.seo.models import SeoMeta
from digitalafarin_cms.apps.sites.models import Organization, Site
from digitalafarin_cms.apps.sites.site_settings import validate_site_settings

BASE = "/api/cms/v1/content/"
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}


class SitemapRobotsTests(TestCase):
    def setUp(self):
        org = Organization.objects.create(name="Seo", slug="seo-files")
        self.site = Site.objects.create(
            organization=org, name="Seo", domain="seo.example",
            settings={"frontend_url": "https://www.seo.example"},
        )
        self.kind = ContentTypeDefinition.objects.create(site=self.site, name="Post", slug="post")
        self.client = APIClient()

    def publish(self, slug, path=None, **seo):
        entry = ContentEntry.objects.create(
            site=self.site, content_type=self.kind, title=slug, slug=slug,
            path=path or f"/{slug}/", status="published")
        if seo:
            SeoMeta.objects.create(entry=entry, **seo)
        publish_snapshot(entry)
        return entry

    def sitemap(self, **params):
        return self.client.get(BASE + "sitemap/", {"site": "seo.example", **params})

    def locs(self, response):
        root = ElementTree.fromstring(response.content)
        return [node.text for node in root.findall(".//s:loc", NS)]

    def test_lastmod_follows_latest_publication_not_first(self):
        entry = self.publish("news")
        old = timezone.now() - timedelta(days=400)
        ContentEntry.objects.filter(pk=entry.pk).update(published_at=old)
        entry.refresh_from_db()
        PublishedEntry.objects.filter(entry=entry).update(published_at=old, last_published_at=old)
        before = ElementTree.fromstring(self.sitemap().content).find(".//s:lastmod", NS).text
        self.assertTrue(before.startswith(old.strftime("%Y-%m-%d")))
        publish_snapshot(entry)  # republish
        row = PublishedEntry.objects.get(entry=entry)
        self.assertEqual(row.published_at, old)  # first publication preserved
        self.assertGreater(row.last_published_at, old)
        after = ElementTree.fromstring(self.sitemap().content).find(".//s:lastmod", NS).text
        self.assertTrue(after.startswith(timezone.now().strftime("%Y-%m-%d")))
        self.assertRegex(after, r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$")

    def test_excludes_noindex_and_foreign_canonicals_but_keeps_self_canonical(self):
        self.publish("plain")
        self.publish("hidden", robots_index=False)
        self.publish("elsewhere", canonical_url="https://other.example/page/")
        self.publish("selfref", canonical_url="https://www.seo.example/selfref/")
        self.publish("blank", canonical_url="")
        locs = self.locs(self.sitemap())
        self.assertEqual(sorted(locs), [
            "https://www.seo.example/blank/", "https://www.seo.example/plain/",
            "https://www.seo.example/selfref/",
        ])

    def test_urls_are_absolute_xml_escaped_percent_encoded_and_utf8(self):
        self.publish("amp", path="/a&b/")
        self.publish("fa", path="/blog/مقاله/")
        response = self.sitemap()
        self.assertEqual(response["Content-Type"], "application/xml; charset=utf-8")
        self.assertIn(b"https://www.seo.example/a&amp;b/", response.content)
        self.assertTrue(response.content.startswith(b'<?xml version="1.0" encoding="UTF-8"?>'))
        locs = self.locs(response)  # parses => well-formed
        self.assertIn("https://www.seo.example/blog/%D9%85%D9%82%D8%A7%D9%84%D9%87/", locs)
        self.assertIn("https://www.seo.example/a&b/", locs)

    @override_settings(DIGITALAFARIN_CMS_SITEMAP_PAGE_SIZE=2)
    def test_large_sites_get_an_index_and_paginated_children(self):
        for i in range(5):
            self.publish(f"p{i}")
        index = ElementTree.fromstring(self.sitemap().content)
        self.assertTrue(index.tag.endswith("sitemapindex"))
        self.assertEqual(self.locs(self.sitemap()), [f"https://www.seo.example/sitemaps/{n}.xml" for n in (1, 2, 3)])
        pages = [self.locs(self.sitemap(page=n)) for n in (1, 2, 3)]
        self.assertEqual([len(p) for p in pages], [2, 2, 1])
        self.assertEqual(len({loc for page in pages for loc in page}), 5)
        self.assertEqual(self.sitemap(page=4).status_code, 404)
        self.assertEqual(self.sitemap(page="x").status_code, 400)

    @override_settings(DIGITALAFARIN_CMS_SITEMAP_PAGE_SIZE=2)
    def test_small_sites_stay_a_single_urlset(self):
        self.publish("a")
        self.publish("b")
        root = ElementTree.fromstring(self.sitemap().content)
        self.assertTrue(root.tag.endswith("urlset"))
        self.assertEqual(self.sitemap(page=1).status_code, 200)

    def test_default_page_size_is_ten_thousand(self):
        from digitalafarin_cms.apps.content.seo_files import sitemap_page_size
        self.assertEqual(sitemap_page_size(), 10_000)

    def test_robots_for_indexable_site_blocks_admin_and_preview_and_uses_frontend_sitemap(self):
        body = self.client.get(BASE + "robots/", {"site": "seo.example"}).content.decode()
        lines = body.splitlines()
        self.assertEqual(lines[0], "User-agent: *")
        for expected in ("Allow: /", "Disallow: /cms/", "Disallow: /digitalafarin-cms-preview/", "Disallow: /__cms_preview/"):
            self.assertIn(expected, lines)
        self.assertIn("Sitemap: https://www.seo.example/sitemap.xml", lines)
        self.assertNotIn("Disallow: /", lines)

    @override_settings(DIGITALAFARIN_CMS_ADMIN_BASE_PATH="/studio")
    def test_admin_base_path_is_configurable(self):
        body = self.client.get(BASE + "robots/", {"site": "seo.example"}).content.decode()
        self.assertIn("Disallow: /studio/", body.splitlines())

    def test_robots_noindex_site_disallows_everything(self):
        self.site.settings = {**self.site.settings, "seo_defaults": {"robots_index": False}}
        self.site.save()
        lines = self.client.get(BASE + "robots/", {"site": "seo.example"}).content.decode().splitlines()
        self.assertEqual(lines[:2], ["User-agent: *", "Disallow: /"])
        self.assertFalse(any(line.startswith("Sitemap:") for line in lines))

    def test_custom_rules_are_appended_and_unsafe_lines_dropped(self):
        self.site.settings = {**self.site.settings, "robots_rules": [
            "Disallow: /private/", "Crawl-delay: 5", "<script>", "Disallow:",
        ]}
        self.site.save()
        lines = self.client.get(BASE + "robots/", {"site": "seo.example"}).content.decode().splitlines()
        self.assertIn("Disallow: /private/", lines)
        self.assertIn("Crawl-delay: 5", lines)
        self.assertNotIn("<script>", lines)

    def test_robots_rule_validation(self):
        self.assertEqual(validate_site_settings({"robots_rules": ["Disallow: /x/"]})["robots_rules"], ["Disallow: /x/"])
        for bad in ("Disallow: /x/", ["bad line"], ["Disallow: /a\nDisallow: /b"], ["Disallow: /x"] * 51):
            with self.subTest(bad=bad), self.assertRaises(serializers.ValidationError):
                validate_site_settings({"robots_rules": bad})
