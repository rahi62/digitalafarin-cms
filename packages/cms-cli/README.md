# @digitalafarin/cms-cli

Installer/wiring CLI for adding DigitalAfarin CMS to existing Django + Next.js projects.

## Basic usage

```bash
npx @digitalafarin/cms-cli init
```

For split folders:

```bash
npx @digitalafarin/cms-cli init --backend backend --frontend frontend
```

The CLI:

1. installs `digitalafarin-cms[all]` through pip;
2. adds the CMS settings helper to Django;
3. mounts `/api/cms/v1/`;
4. runs Django migrations unless `--skip-migrate` is used;
5. installs `@digitalafarin/cms-next` into the host frontend;
6. creates `.env.local` defaults and a Next.js CMS client adapter;
7. with `--with-admin`, installs `@digitalafarin/cms-admin` into that same frontend and embeds `/cms` into the host App Router.

By default it does **not** overwrite an existing Next.js route or page renderer.

For an App Router site that should expose CMS-created paths directly, add:

```bash
npx @digitalafarin/cms-cli init \
  --frontend frontend \
  --with-public-route
```

This creates `app/[[...cms_path]]/page.tsx` (or `src/app/...`) plus a reusable block renderer. The generated renderer uses the SDK's safe Tiptap JSON renderer. If the application already has a root catch-all route, the CLI stops and asks you to integrate `cms.resolve()` into the existing route instead of creating a conflicting route.

## Existing `/blog` routes

A catch-all cannot replace an existing `/blog` or `/blog/[slug]` page. Generate a review plan instead:

```bash
npx @digitalafarin/cms-cli@0.7.0 init \
  --frontend frontend \
  --with-collection \
  --collection-path /blog \
  --content-type post
```

The CLI inventories host routes and writes conflicting changes under `.digitalafarin/proposals/`. Review them first, then apply only if the original file hash still matches:

```bash
npx @digitalafarin/cms-cli@0.7.0 apply-integration --frontend frontend
npx @digitalafarin/cms-cli@0.7.0 doctor --frontend frontend
```

The generated detail adapter gives CMS published content priority, falls back to the host loader only on a normal public CMS 404, and never falls back for preview or upstream errors. Collection pagination is not merged with legacy arrays; the generated adapter keeps the legacy list explicitly available via `?cms_source=legacy`.

## Add the visual CMS Admin under `/cms`

The default Admin mode is **embedded**. It uses the existing Next.js application and the same `node_modules`:

```bash
npx @digitalafarin/cms-cli init \
  --backend backend \
  --frontend frontend \
  --with-admin \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1
```

To install only the embedded Admin into an existing frontend:

```bash
npx @digitalafarin/cms-cli admin \
  --frontend frontend \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1
```

The host project remains one Next.js application:

```text
frontend/
├─ app/ or src/app/
│  └─ cms/
├─ digitalafarin-cms-admin/ or src/digitalafarin-cms-admin/
├─ node_modules/
└─ package.json
```

No `cms-admin/node_modules` is created.

For intentionally isolated deployments, the legacy standalone mode remains explicit:

```bash
npx @digitalafarin/cms-cli admin-standalone \
  --admin-dir cms-admin \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1 \
  --admin-port 3001
```

## Doctor

```bash
npx @digitalafarin/cms-cli doctor
```

`doctor` reports detected Django and Next.js application directories without modifying the project.

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
--admin-package SPEC
--force-admin

Standalone-only flags:
--admin-dir DIR
--admin-port 3001
--force-admin
```

Package override flags are useful when testing local release artifacts.

## Local archives

```bash
npx ./digitalafarin-cms-cli-0.7.0.tgz init \
  --django-package ../digitalafarin_cms-0.7.0-py3-none-any.whl \
  --next-package ../digitalafarin-cms-next-0.7.0.tgz \
  --with-admin \
  --admin-package ../digitalafarin-cms-admin-0.7.0.tgz
```

The release CI installs packed SDK, CLI and Admin packages into a clean temporary consumer, executes the installed binaries and verifies that `/cms` scaffolding is complete.
