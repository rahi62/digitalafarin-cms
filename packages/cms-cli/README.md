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
```

`--django-package` and `--next-package` are useful when testing local release artifacts.

## Local v0.3 archives

```bash
npx ./digitalafarin-cms-cli-0.3.0.tgz init \
  --django-package ../digitalafarin_cms-0.3.0-py3-none-any.whl \
  --next-package ../digitalafarin-cms-next-0.3.0.tgz
```

The release CI installs the packed CLI into a clean temporary consumer and executes the installed binary to protect against broken `bin` metadata or missing package files.
