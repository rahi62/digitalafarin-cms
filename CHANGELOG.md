# Changelog

All notable changes will be documented here.

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
