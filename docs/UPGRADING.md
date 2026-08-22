# Upgrading DigitalAfarin CMS

## 0.2.1 -> 0.3.0

v0.3 adds significant CMS workflow, Audit and SEO intelligence features. The package remains pre-1.0, so test the upgrade in staging before production.

## 1. Back up application data

Before upgrading a production host project, back up the database and any externally stored media.

## 2. Upgrade all synchronized packages

Python:

```bash
pip install --upgrade "digitalafarin-cms[all]==0.3.0"
```

Next.js SDK:

```bash
npm install @digitalafarin/cms-next@0.3.0
```

CLI, when installed directly:

```bash
npm install --save-dev @digitalafarin/cms-cli@0.3.0
```

## 3. Apply Django migrations

```bash
python manage.py migrate
python manage.py check
```

v0.3 introduces persisted Search Performance/import models and Audit V2 page-level data. Existing CMS data is preserved by migrations.

## 4. Review editorial workflow behavior

Publishing is now intentionally action-driven. Writers should submit content for review, while roles with publish capability use the explicit Publish/Schedule workflow actions.

If an integration previously changed an entry's `status` directly to `published` or `scheduled`, update it to use the CMS workflow endpoints instead.

## 5. Configure Site Settings

For each Site, review:

- frontend URL
- Audit base URL
- site/brand name
- title template
- default description
- default Open Graph image
- robots defaults
- global Organization schema

The public site-context endpoint exposes only an allow-listed SEO-safe subset of these settings.

## 6. Next.js metadata behavior

`cms.resolve()` can now enrich a resolved page with sanitized site SEO context. `toNextMetadata()` uses site-level defaults when an entry does not define its own values.

If your application manually applies a second title template or global metadata fallback after calling `toNextMetadata()`, review it for duplicate formatting.

## 7. Audit V2

Audit now stores page-level crawl data and uses a same-origin crawler with network-safety restrictions. Create a new Audit run after upgrading; historical data from the earlier foundation does not provide all v0.3 page metrics.

## 8. Search Performance and Content Decay

v0.3 accepts Search Console-compatible daily page metrics through its import API/admin UI.

Google OAuth credentials and automatic Google Search Console synchronization are not stored by the Community Edition in this release. Existing exports or external workers can feed the import API.

## 9. SEO Opportunity Engine

The Opportunities view is computed from available data. For the most useful results, ensure the site has:

1. published CMS entries,
2. a recent completed Audit,
3. Search Performance data covering current and baseline windows,
4. SeoMeta records and analysis where applicable.

Missing data sources do not prevent the CMS from operating; they reduce the number of intelligence signals available.

## 10. Verify the host application

Recommended smoke checks:

```bash
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
python manage.py check
python manage.py showmigrations
```

For the frontend:

```bash
npm run build
```

Then verify at least one published resolver route, metadata output, menu endpoint and any scheduled publishing worker used in production.
