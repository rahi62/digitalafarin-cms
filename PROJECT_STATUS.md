# Project status — Community Edition 0.2.0 alpha

## Implemented

### Package/distribution
- Installable Django/DRF package: `digitalafarin-cms`
- Installable Next.js SDK: `@digitalafarin/cms-next`
- Installer/wiring CLI: `@digitalafarin/cms-cli`
- Apache-2.0 Community licensing
- GitHub CI and OIDC Trusted-Publishing release workflows
- Synchronized semantic version tooling

### CMS core
- Organizations, sites and memberships
- Tenant-scoped authenticated APIs
- Role-aware writes; Viewer is read-only
- Owner/Admin-only membership administration
- Same-site relationship validation for core content/SEO entities
- Dynamic content type definitions
- Structured JSON blocks
- Draft/review/scheduled/published/archived content states
- Revision snapshots and restore endpoint
- Categories, tags, menus and reusable blocks
- Scheduled publishing foundation with Celery

### SEO core
- Title/description/canonical/robots/Open Graph/Twitter metadata
- Focus/secondary keywords and basic SEO analysis score
- Keyword clusters and page mappings
- JSON-LD schema storage
- Redirect manager and public redirect resolver
- Internal-link suggestion data model
- Sitemap and robots endpoints

### Platform
- JWT authentication
- Media API
- Celery/Redis integration foundation
- SEO audit run/issue foundation
- Webhook registry
- Example Django host project
- Next.js admin application in the monorepo
- Example Next.js consumer

## Intentionally not claimed as complete

These remain roadmap/commercial-grade modules rather than finished 0.2.0 features:
- production-grade visual Gutenberg-style block editor
- full crawler comparable with dedicated technical SEO crawlers
- Google Search Console OAuth/ETL and historical intelligence
- semantic/AI internal-link engine
- production image transformation/storage pipeline for S3/R2
- AI writing and optimization assistant
- subscriptions, billing, quotas and license server
- white-label/agency control plane
- enterprise SSO/audit/compliance features
- fine-grained per-content-type/per-field permissions beyond current organization-role isolation

The public `0.2.0` release should be presented as **alpha Community Edition**, not as a 1.0 WordPress replacement yet.
