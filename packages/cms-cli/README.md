# @digitalafarin/cms-cli

Installer and reviewed integration CLI for DigitalAfarin CMS in Django + Next.js projects.

## Basic wiring

```bash
npx @digitalafarin/cms-cli@0.7.0 init --backend backend --frontend frontend
```

The CLI installs synchronized packages, mounts the Django API before host catch-alls, runs migrations unless skipped, creates the public SDK adapter, and never treats an existing route as integrated merely because a catch-all exists.

## Existing /blog and /blog/[slug]

```bash
npx @digitalafarin/cms-cli@0.7.0 init \
  --frontend frontend \
  --with-collection \
  --collection-path /blog \
  --content-type post
```

The CLI inventories App Router pages and writes:

```text
.digitalafarin/integration.json
.digitalafarin/INTEGRATION.md
.digitalafarin/proposals/...
```

Existing route files are not overwritten. Review the generated proposal, then:

```bash
npx @digitalafarin/cms-cli@0.7.0 apply-integration --frontend frontend
npx @digitalafarin/cms-cli@0.7.0 doctor --frontend frontend
```

`apply-integration` verifies the original file hash before replacing a reviewed route and stores a backup/legacy page beside the route when required. If the host file changed after proposal generation, apply stops.

The default detail policy is CMS first, redirect second, legacy detail only after a normal public CMS 404. Preview and upstream failures do not fall back. The generated collection keeps one authoritative paginated source; the legacy collection remains available explicitly rather than merging two incompatible pagination counts.

## Public catch-all

```bash
npx @digitalafarin/cms-cli@0.7.0 init --frontend frontend --with-public-route
```

The catch-all serves otherwise-unowned CMS paths. It does not override dedicated routes such as `/blog` or `/blog/[slug]`.

## Media and preview infrastructure

The integration planner creates non-conflicting infrastructure where possible:

- `app/media/[...path]/route.ts` using the fixed-upstream media handler;
- `app/digitalafarin-cms-preview/[[...cms_path]]/page.tsx` as the internal preview renderer;
- the shared block renderer.

If a custom `next.config.*` exists, the CLI reports that `withDigitalAfarinCms()` composition needs review instead of rewriting the host config blindly.

Required frontend values for same-origin media:

```env
DIGITALAFARIN_CMS_URL=http://localhost:8000/api/cms/v1
DIGITALAFARIN_CMS_SITE=localhost:3000
DIGITALAFARIN_CMS_MEDIA_UPSTREAM=http://localhost:8000/media/
```

## Embedded Admin

```bash
npx @digitalafarin/cms-cli@0.7.0 init \
  --backend backend \
  --frontend frontend \
  --with-admin \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1
```

The Admin is installed into the host frontend and uses its existing `node_modules`. Standalone mode remains available with `admin-standalone`.

## Doctor

```bash
npx @digitalafarin/cms-cli@0.7.0 doctor --backend backend --frontend frontend
```

Frontend doctor reports pending integration proposals, missing preview config composition and missing same-origin media upstream. Backend doctor checks CMS URL ownership, pending CMS/Wagtail migrations, missing Wagtail tables and media configuration.

## Useful flags

```text
--backend DIR
--frontend DIR
--python CMD
--skip-install
--skip-migrate
--django-package SPEC
--next-package SPEC
--with-public-route
--with-collection
--collection-path /blog
--content-type post
--with-admin
--admin-package SPEC
--admin-base-path /cms
--admin-api-url URL
--force-admin
```

Standalone-only:

```text
--admin-dir DIR
--admin-port 3001
```

For a 0.6.0 upgrade, follow `docs/UPGRADE-0.7.0.fa.md` in the repository.
