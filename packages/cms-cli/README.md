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
5. installs `@digitalafarin/cms-next`;
6. creates `.env.local` defaults and a Next.js CMS client adapter.

It does **not** overwrite an existing Next.js route or page renderer.

## Add the visual CMS Admin under `/cms`

To wire the backend/frontend and also scaffold the separate Next.js admin application:

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

Or scaffold only the admin application:

```bash
npx @digitalafarin/cms-cli admin \
  --admin-dir cms-admin \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1 \
  --admin-port 3001
```

The generated admin app is a standalone Next.js application. It can be reverse-proxied from the main website domain so editorial users visit `https://example.com/cms/` without a separate CMS subdomain.

The generated `cms-admin/deploy/nginx.cms.conf` contains the Nginx location block.

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
--with-admin
--admin-package SPEC
--admin-dir DIR
--admin-base-path /cms
--admin-api-url URL
--admin-port 3001
--force-admin
```

Package override flags are useful when testing local release artifacts.

## Local archives

```bash
npx ./digitalafarin-cms-cli-0.4.0.tgz init \
  --django-package ../digitalafarin_cms-0.4.0-py3-none-any.whl \
  --next-package ../digitalafarin-cms-next-0.4.0.tgz \
  --with-admin \
  --admin-package ../digitalafarin-cms-admin-0.4.0.tgz
```

The release CI installs packed SDK, CLI and Admin packages into a clean temporary consumer, executes the installed binaries and verifies that `/cms` scaffolding is complete.
