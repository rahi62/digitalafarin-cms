# DigitalAfarin CMS

**SEO-first headless CMS for Django + Next.js.**

DigitalAfarin CMS combines a reusable Django/DRF content backend, a Next.js SDK, a visual Next.js Admin application and an installer CLI. It is designed for teams that want WordPress-like content management and SEO workflows without coupling rendering to WordPress.

> Status: **0.4.0 pre-release / Community Edition**. The public API can still change before 1.0.

## Packages

| Package | Registry | Purpose |
|---|---|---|
| `digitalafarin-cms` | PyPI | Django/DRF CMS, SEO, audit and integrations backend |
| `@digitalafarin/cms-next` | npm | Next.js resolver, metadata and JSON-LD helpers |
| `@digitalafarin/cms-admin` | npm | Scaffoldable visual Next.js CMS Admin for `/cms` path deployments |
| `@digitalafarin/cms-cli` | npm | Installer/wiring CLI for Django + Next.js + CMS Admin |

## Installation

Django:

```bash
pip install "digitalafarin-cms[all]"
```

Public Next.js site:

```bash
npm install @digitalafarin/cms-next
```

Wire an existing repository automatically:

```bash
npx @digitalafarin/cms-cli init --backend backend --frontend frontend
```

Wire the backend/frontend **and** scaffold the visual Admin under `/cms`:

```bash
npx @digitalafarin/cms-cli init \
  --backend backend \
  --frontend frontend \
  --with-admin \
  --admin-dir cms-admin \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1 \
  --admin-port 3001
```

Or scaffold only the Admin application:

```bash
npx @digitalafarin/cms-admin scaffold \
  --dir cms-admin \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1 \
  --port 3001
```

The generated Admin uses a same-origin `/cms/api-proxy` route. Browser requests stay on the main website origin while the Admin server forwards requests to the Django API upstream. This avoids requiring direct browser CORS access when Django is hosted on an API subdomain.

## Recommended production layout

```text
https://example.com/        Public Next.js website
https://example.com/cms/    DigitalAfarin CMS Admin
/cms/api-proxy/*            Same-origin Admin API proxy
Django CMS API              api.example.com or an internal upstream
```

The Admin scaffold generates `deploy/nginx.cms.conf` for routing `/cms/` to its Node process.

Django Admin is still useful for technical maintenance, but normal editorial/content management should happen in the visual Next.js CMS Admin.

## Django integration

At the end of `settings.py`:

```python
from digitalafarin_cms.settings import apply_defaults
apply_defaults(globals())
```

Mount the API:

```python
from django.urls import include, path

urlpatterns += [
    path("api/cms/v1/", include("digitalafarin_cms.urls")),
]
```

Then run:

```bash
python manage.py migrate
```

## Public Next.js integration

Set:

```env
DIGITALAFARIN_CMS_URL=http://localhost:8000/api/cms/v1
DIGITALAFARIN_CMS_SITE=example.com
```

Create a client:

```ts
import { createCmsClientFromEnv } from "@digitalafarin/cms-next";

export const cms = createCmsClientFromEnv({ revalidate: 60 });
```

Resolve a page:

```ts
const page = await cms.resolve("/services/seo/");
```

The resolver returns the page payload together with SEO metadata and sanitized site-level SEO context. The SDK also exposes helpers for Next.js metadata and JSON-LD rendering.

## CMS capabilities

### Content management

- Organizations and multi-site tenancy
- Dynamic content types and custom fields
- Visual structured Block Editor
- Pages, posts and custom entries
- Parent/child content hierarchy
- Categories, tags and taxonomy assignment
- Menu Builder with nested menu items
- Reusable blocks
- Media Library
- Revision snapshots and restore support
- Role-aware editorial workflow
- Review, publish, schedule and archive states
- Scheduled publishing foundation with Celery

### SEO management

- SEO title, meta description, canonical and robots controls
- Open Graph and Twitter metadata
- Site-level SEO defaults and title templates
- Global Organization/LocalBusiness-style JSON-LD defaults
- Per-entry Schema Builder
- Keyword clusters and keyword mapping
- Redirect manager
- Internal-link suggestions
- Sitemap and `robots.txt` endpoints
- Secure preview support

### SEO Audit & intelligence

- Same-origin, SSRF-aware SEO crawler
- Page-level crawl metrics
- Technical/content issue engine
- Site health score
- Audit history and crawl comparison
- New / fixed / persistent issue tracking
- Search Performance daily data foundation
- Manual / connector-friendly Search Console data import
- Content Decay analysis across equal comparison windows
- Ranking-loss, CTR-loss, demand-decline and refresh signals
- Unified SEO Opportunity Engine
- Prioritized SEO Action Queue combining Audit, Search Performance, SeoMeta and internal-link signals

> The Community Edition stores and analyzes Search Console-compatible performance data, but Google OAuth credential storage and automatic Google Search Console synchronization are not yet part of the core package.

### Developer experience

- JWT API authentication
- Next.js SDK with metadata and schema helpers
- Scaffoldable visual CMS Admin
- Django + Next.js + Admin installer CLI
- `/cms` path deployment with generated Nginx config
- Same-origin Admin API proxy
- Tenant isolation and role-aware write protection
- npm Trusted Publishing and PyPI OIDC release workflow
- Python 3.11 / 3.12 / 3.13 CI
- Migration-drift checks
- Installed-wheel smoke tests
- Real npm tarball consumer/scaffold tests for SDK, CLI and Admin

## Community Edition and commercial direction

The Apache-2.0 Community Edition is usable on its own. Managed Cloud, billing, advanced AI-assisted SEO, agency/white-label controls, managed Google integrations and enterprise services can be developed separately. See [`docs/COMMERCIAL.md`](docs/COMMERCIAL.md).

## Repository layout

```text
apps/admin/              Publishable/scaffoldable Next.js CMS Admin
apps/backend/            Example/self-hosted Django host project
packages/cms-django/     Publishable PyPI package
packages/cms-next/       Publishable npm SDK
packages/cms-cli/        Publishable npm installer CLI
examples/next-site/      Example Next.js consumer
.github/workflows/       CI and trusted-publishing release workflows
docs/                    Architecture, upgrade and release documentation
```

## Development

### Python package

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
python -m pip install -U pip
pip install -e "./packages/cms-django[all]"
```

### Node workspaces

```bash
npm install
npm run typecheck
```

## Release model

Versions are synchronized across Python, npm packages (including CMS Admin) and lockfile metadata.

```bash
npm run version:set -- 0.4.0
npm run check:versions
```

Before a release, follow [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md). A `v*` tag triggers `.github/workflows/release.yml`, which validates and publishes through npm Trusted Publishing and PyPI OIDC.

Upgrade notes are maintained in [`docs/UPGRADING.md`](docs/UPGRADING.md) and release history in [`CHANGELOG.md`](CHANGELOG.md).

## Security

Please report security issues privately as described in [`SECURITY.md`](SECURITY.md). Do not open public issues for undisclosed vulnerabilities.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
