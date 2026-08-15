# @digitalafarin/cms-cli

After the Django and npm packages are published, an existing Django + Next.js repository can be wired with:

```bash
npx @digitalafarin/cms-cli init
```

For split folders:

```bash
npx @digitalafarin/cms-cli init --backend backend --frontend frontend
```

The CLI:

1. installs `digitalafarin-cms[all]` through pip;
2. adds the CMS apps/settings helper to Django;
3. mounts `/api/cms/v1/`;
4. runs Django migrations;
5. installs `@digitalafarin/cms-next`;
6. creates `.env.local` defaults and the Next.js CMS client adapter.

It does **not** overwrite an existing Next.js route or page renderer.

For local archives during development:

```bash
npx ./digitalafarin-cms-cli-0.2.0.tgz init \
  --django-package ../digitalafarin-cms-0.2.0.tar.gz \
  --next-package ../digitalafarin-cms-next-0.2.0.tgz
```
