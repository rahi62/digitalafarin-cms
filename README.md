# DigitalAfarin CMS

**SEO-first headless CMS for Django + Next.js.**

DigitalAfarin CMS provides a reusable Django/DRF content and SEO backend, a Next.js SDK, and a CLI that wires both sides into an existing application.

> Status: **0.2.0 alpha / Community Edition**. The public API may still change before 1.0.

## Packages

| Package | Registry | Purpose |
|---|---|---|
| `digitalafarin-cms` | PyPI | Django/DRF CMS + SEO backend |
| `@digitalafarin/cms-next` | npm | Next.js client, metadata and schema helpers |
| `@digitalafarin/cms-cli` | npm | Installer/wiring CLI for existing projects |

## Installation

Django:

```bash
pip install "digitalafarin-cms[all]"
```

Next.js:

```bash
npm install @digitalafarin/cms-next
```

Or wire an existing repository automatically:

```bash
npx @digitalafarin/cms-cli init --backend backend --frontend frontend
```

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

## Next.js integration

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

The resolver returns content, blocks, SEO metadata, schemas, breadcrumbs and related entries in a single payload.

## Community Edition features

- Organizations and multi-site data model
- Dynamic content types
- Structured JSON block content
- Pages, posts and custom entries
- Categories, tags, menus and reusable blocks
- Revision history
- Media library model
- SEO title, description, canonical, robots and Open Graph metadata
- JSON-LD schema storage
- Keywords and keyword clusters
- Redirect manager
- Sitemap and `robots.txt` endpoints
- Scheduled publishing foundation with Celery
- SEO audit run/issue foundation
- Webhooks/revalidation foundation
- JWT API authentication
- Next.js SDK
- Django + Next.js installer CLI

## Commercial direction

The Apache-2.0 Community Edition remains usable on its own. Commercial products can be built separately around managed hosting, advanced crawler/audit capabilities, Search Console intelligence, AI SEO, agency controls, white-label features and enterprise support. See [`docs/COMMERCIAL.md`](docs/COMMERCIAL.md).

## Repository layout

```text
apps/admin/              Next.js admin UI
apps/backend/            Example/self-hosted Django host project
packages/cms-django/     Publishable PyPI package
packages/cms-next/       Publishable npm SDK
packages/cms-cli/        Publishable npm CLI
examples/next-site/      Example Next.js consumer
.github/workflows/       CI and trusted-publishing release workflows
docs/                    Release and product documentation
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

Versions are synchronized across Python and npm packages.

```bash
npm run version:set -- 0.2.1
npm run check:versions
git add .
git commit -m "release: v0.2.1"
git tag v0.2.1
git push origin main --tags
```

A `v*` tag triggers `.github/workflows/release.yml`. PyPI and npm publishing are designed for OIDC Trusted Publishing and do not require long-lived write tokens after registry setup.

See [`docs/PUBLISHING.fa.md`](docs/PUBLISHING.fa.md) for the exact first-publication checklist.

## Security

Please report security issues privately as described in [`SECURITY.md`](SECURITY.md). Do not open public issues for undisclosed vulnerabilities.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
