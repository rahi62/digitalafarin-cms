# Changelog

All notable changes to DigitalAfarin CMS are documented here.

The project uses synchronized versions for the Django package, Next.js SDK, Admin and CLI.

## [0.4.0] - Unreleased

### Added

- New publishable `@digitalafarin/cms-admin` package.
- Scaffoldable Next.js CMS Admin application designed for path deployment under `/cms`.
- `digitalafarin-cms-admin scaffold` command with configurable admin directory, base path, Django API upstream and port.
- `@digitalafarin/cms-cli admin` command for scaffolding only the visual Admin application.
- `@digitalafarin/cms-cli init --with-admin` for wiring Django, the public Next.js SDK and the visual Admin in one workflow.
- Generated Nginx `/cms` reverse-proxy configuration.
- Same-origin `/cms/api-proxy/*` route in the Admin application; the browser no longer needs direct CORS access to a separate Django API subdomain.
- Admin package tarball and CLI-to-Admin integration smoke tests in CI/release verification.

### Changed

- The Next.js Admin now supports a configurable `NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH`, defaulting to `/cms`.
- Admin authentication, login, logout and unauthorized redirects are base-path aware.
- Hard-coded demonstration credentials were removed from the login form.
- Version synchronization, lockfile validation, `pack:all` and npm release publishing now include `@digitalafarin/cms-admin`.
- The intended editorial workflow is the visual Next.js Admin; Django Admin remains a technical/maintenance interface.

### Deployment

A typical production layout is now:

```text
https://example.com/       -> public Next.js website
https://example.com/cms/   -> DigitalAfarin CMS Admin Next.js process
/cms/api-proxy/*           -> same-origin Admin proxy
Django CMS API             -> API subdomain or internal upstream
```

## [0.3.0] - 2026-08-23

### Added

- Visual/admin content workflow for dynamic content types and structured blocks.
- Parent/child content hierarchy and featured-content controls.
- Categories, tags and entry-level taxonomy assignment.
- Nested Menu Builder plus public menu resolver support.
- Role-aware editorial workflow with Review, Publish and Schedule actions.
- Scheduled publishing foundation using Celery.
- Revision snapshots expanded to include hierarchy, taxonomy and scheduling state.
- Site Settings for frontend/audit URLs, SEO defaults and Organization schema defaults.
- Sanitized public site context used by the Next.js SDK.
- Site-level title templates, metadata fallbacks and global schema helpers.
- SEO Audit V2 with same-origin crawler, page-level metrics, issue engine and health score.
- Audit Trends with new, fixed and persistent issue comparison.
- Search Performance daily page-level storage and bulk import API.
- Content Decay analysis across equal current/baseline windows.
- Ranking-loss, CTR-loss, demand-decline, content-refresh and quick-win signals.
- Unified SEO Opportunity Engine combining Audit, Search Performance, SeoMeta, content freshness and internal-link signals.
- SEO Opportunities Action Queue in the admin application.
- Release hardening for installed Python wheels and packed npm tarballs.
- Django migration-drift checks in CI.
- Python 3.11, 3.12 and 3.13 test matrix.

### Changed

- Next.js `resolve()` enriches page results with sanitized site SEO context.
- `toNextMetadata()` applies site-level defaults when page metadata is absent.
- Schema helpers can emit both page schemas and global Organization schema.
- Content publishing is enforced through explicit workflow actions instead of unrestricted status mutation.
- Private content types are excluded from public resolver/sitemap behavior.
- Version tooling synchronizes `package-lock.json` metadata with publishable packages.
- Release workflow smoke-tests built artifacts before registry publication.

### Security

- Site settings public API is allow-listed and does not expose arbitrary `Site.settings` keys.
- Writer/SEO role boundaries were tightened for Site identity and CMS settings.
- Audit crawling restricts requests to safe HTTP/HTTPS same-origin targets and rejects unsafe/private network targets by default.
- Search Performance imports reject pages that do not belong to the selected Site hosts.
- Search Performance writes are restricted to Owner/Admin/SEO roles.
- Tenant isolation tests cover Audit, Search Performance and SEO Opportunity data.

### Notes

- Google Search Console OAuth credential storage and automatic Google synchronization are not included in v0.3. Search Console-compatible data can be imported or supplied by a future connector/worker.
- v0.3 remains pre-1.0; public APIs may still evolve before 1.0.

## [0.2.1] - 2026-08

- First verified public package set across PyPI and npm.
- `digitalafarin-cms==0.2.1` published to PyPI.
- `@digitalafarin/cms-next@0.2.1` published to npm.
- `@digitalafarin/cms-cli@0.2.1` published to npm.
- npm Trusted Publishing configured for both scoped npm packages.
- Core multi-site CMS, SEO metadata, resolver SDK and installer CLI foundation established.

## [0.2.0] - 2026-08-12

### Added

- Publishable `digitalafarin-cms` Django/DRF package.
- Publishable `@digitalafarin/cms-next` SDK.
- Publishable `@digitalafarin/cms-cli` installer.
- Multi-site content, SEO, redirect, schema, media and audit foundations.
- OIDC/Trusted Publishing-ready GitHub Actions workflows.
- Apache-2.0 Community Edition licensing.
- Public release documentation and synchronized version tooling.

### Security and release hardening

- Added organization-scoped tenant isolation for authenticated CMS APIs.
- Added role-aware write protection; Viewer memberships are read-only.
- Kept membership administration restricted to Owner/Admin.
- Rebuilt initial migrations with namespaced Django app labels.
- Synchronized the TypeScript SDK source with its public runtime API.
- Added CI and OIDC-based release workflows for PyPI and npm.
