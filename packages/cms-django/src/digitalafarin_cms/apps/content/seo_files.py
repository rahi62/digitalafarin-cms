"""sitemap.xml and robots.txt generation (read-only, from published snapshots)."""
from __future__ import annotations

import math
import re
from datetime import timezone as dt_timezone
from urllib.parse import quote
from xml.sax.saxutils import escape as xml_escape

from django.conf import settings
from django.db.models import CharField, F, Q, Value
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Cast, Coalesce, Concat

from .public import public_entries

SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
DEFAULT_SITEMAP_PAGE_SIZE = 10_000
ROBOTS_RULE = re.compile(r"^(User-agent|Allow|Disallow|Crawl-delay|Sitemap|Host)\s*:\s*\S.*$", re.IGNORECASE)
PREVIEW_PATHS = ("/digitalafarin-cms-preview/", "/__cms_preview/")


def sitemap_page_size() -> int:
    return max(1, int(getattr(settings, "DIGITALAFARIN_CMS_SITEMAP_PAGE_SIZE", DEFAULT_SITEMAP_PAGE_SIZE)))


def admin_base_path() -> str:
    value = str(getattr(settings, "DIGITALAFARIN_CMS_ADMIN_BASE_PATH", "/cms") or "/cms").strip()
    return "/" + value.strip("/") + "/"


def sitemap_entries(site, base):
    """Indexable published entries whose canonical (if any) is their own URL."""
    own_url = Concat(Value(base, output_field=CharField()), F("path"), output_field=CharField())
    own_normalized = Concat(Value(base, output_field=CharField()), F("normalized_path"), output_field=CharField())
    return (
        public_entries(site)
        .filter(is_indexable=True)
        .annotate(canonical=Cast(KeyTextTransform("canonical_url", "seo"), CharField()))
        .filter(Q(canonical__isnull=True) | Q(canonical="") | Q(canonical=own_url) | Q(canonical=own_normalized))
        .order_by("normalized_path", "pk")
    )


def _loc(base, path):
    return base + quote(path, safe="/%:@!$&'()*+,;=-._~")


def _lastmod(value):
    return value.astimezone(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def _xml(body):
    return '<?xml version="1.0" encoding="UTF-8"?>' + body


def build_sitemap(site, base, page=None):
    """Return ``(xml, status)``; an index when the URL count exceeds the page size."""
    entries = sitemap_entries(site, base)
    size = sitemap_page_size()
    total = entries.count()
    pages = max(1, math.ceil(total / size))
    if page is None and pages > 1:
        rows = "".join(
            f"<sitemap><loc>{xml_escape(f'{base}/sitemaps/{number}.xml')}</loc></sitemap>"
            for number in range(1, pages + 1)
        )
        return _xml(f'<sitemapindex xmlns="{SITEMAP_NS}">{rows}</sitemapindex>'), 200
    number = page or 1
    if number < 1 or number > pages:
        return "Sitemap page not found", 404
    chunk = entries.annotate(modified=Coalesce("last_published_at", "published_at")).values_list(
        "path", "modified",
    )[(number - 1) * size: number * size]
    rows = "".join(
        f"<url><loc>{xml_escape(_loc(base, path))}</loc><lastmod>{_lastmod(modified)}</lastmod></url>"
        for path, modified in chunk
    )
    return _xml(f'<urlset xmlns="{SITEMAP_NS}">{rows}</urlset>'), 200


def robots_extra_rules(site):
    rules = (site.settings or {}).get("robots_rules") or []
    if not isinstance(rules, list):
        return []
    return [rule.strip() for rule in rules if isinstance(rule, str) and ROBOTS_RULE.match(rule.strip())]


def build_robots(site, base):
    seo = (site.settings or {}).get("seo_defaults") or {}
    indexable = seo.get("robots_index", True) is not False
    lines = ["User-agent: *"]
    if not indexable:
        lines.append("Disallow: /")
    else:
        lines.append("Allow: /")
        lines.append(f"Disallow: {admin_base_path()}")
        lines.extend(f"Disallow: {path}" for path in PREVIEW_PATHS)
    lines.extend(robots_extra_rules(site))
    if indexable:
        lines.append(f"Sitemap: {base}/sitemap.xml")
    return "\n".join(lines) + "\n"
