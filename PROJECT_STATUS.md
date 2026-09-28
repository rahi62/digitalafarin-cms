# Project status — Community Edition 0.7.0 source

## Implemented

### Distribution
- Publishable Django package: `digitalafarin-cms`
- Publishable npm packages: `@digitalafarin/cms-next`, `@digitalafarin/cms-cli`, `@digitalafarin/cms-admin`
- Embedded Admin with optional standalone mode
- Synchronized versions and Trusted Publishing workflows

### Content and routing
- Multi-tenant Organization -> Site model and role-aware writes
- Dynamic content types, structured blocks, rich text, revisions, taxonomies and menus
- Editorial workflow with draft/review/schedule/publish/unpublish
- Content-type collection routing with `collection_path` and `entry_path_pattern`
- Manual/automatic entry path modes, Unicode slugs, reserved-path/conflict validation
- Redirect creation for published URL moves without bulk-moving legacy paths
- Public published-only collection/detail APIs with search/category/tag/pagination
- Canonical path shared by cards, resolver, metadata and sitemap

### Existing-host integration
- App Router inventory and reviewable integration proposals
- Existing route hash verification and backup on apply
- CMS-first detail resolution with legacy fallback only for ordinary public 404
- Dedicated signed preview renderer that can supersede existing pages
- Same-origin fixed-upstream media handler plus external CDN/storage support
- Host doctor checks for routing, media, migrations and Wagtail compatibility

### SEO and intelligence
- Metadata/canonical/robots/Open Graph/Twitter controls
- Schema, keyword mapping, redirects and internal-link foundations
- SEO Audit V2, trends, Search Performance import, decay and opportunity engine

### Validation
- Python 3.11/3.12/3.13 regression suite and migration-drift checks
- 0.6 -> 0.7 migration-preservation test
- SDK/CLI integration tests
- Browser editor tests
- Existing-host E2E fixture covering preview, media, publish/list/detail, route move, unpublish and legacy preservation

## Still pre-1.0

The Community Edition remains pre-1.0. These are not claimed complete:
- full technical crawler parity with dedicated SEO crawlers;
- managed Google Search Console OAuth/ETL;
- production image transformation pipeline;
- AI writing/optimization agent suite;
- billing, quotas, white-label control plane and enterprise SSO/compliance;
- generic automatic semantic merge of arbitrary legacy paginated collection data with CMS data.

For v0.7 migration details see `docs/UPGRADE-0.7.0.fa.md`.
