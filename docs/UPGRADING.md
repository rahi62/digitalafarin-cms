# Upgrading DigitalAfarin CMS

## 0.3.0 -> 0.4.0

v0.4 makes the visual Next.js CMS Admin a first-class installable package and supports serving it under `/cms` on the same website domain. Django Admin remains available for technical maintenance, but normal editorial work should move to the visual Admin.

### 1. Back up production data

Before changing production deployment topology, back up the database, media storage and current Nginx/site configuration.

### 2. Upgrade synchronized packages

Python:

```bash
pip install --upgrade "digitalafarin-cms[all]==0.4.0"
```

Public Next.js SDK:

```bash
npm install @digitalafarin/cms-next@0.4.0
```

CLI, when installed directly:

```bash
npm install --save-dev @digitalafarin/cms-cli@0.4.0
```

Apply/check Django migrations:

```bash
python manage.py migrate
python manage.py check
```

### 3. Scaffold the visual Admin

For a repository with separate `backend/` and `frontend/` directories, the complete CLI workflow is:

```bash
npx @digitalafarin/cms-cli@0.4.0 init \
  --backend backend \
  --frontend frontend \
  --with-admin \
  --admin-dir cms-admin \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1 \
  --admin-port 3001
```

If the Django/SDK packages are already wired, scaffold only the Admin:

```bash
npx @digitalafarin/cms-cli@0.4.0 admin \
  --admin-dir cms-admin \
  --admin-base-path /cms \
  --admin-api-url https://api.example.com/api/cms/v1 \
  --admin-port 3001
```

Or use the Admin package directly:

```bash
npx @digitalafarin/cms-admin@0.4.0 scaffold \
  --dir cms-admin \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1 \
  --port 3001
```

### 4. Generated Admin environment

The scaffold produces values equivalent to:

```env
NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH=/cms
NEXT_PUBLIC_API_URL=/cms/api-proxy
DIGITALAFARIN_CMS_API_URL=https://api.example.com/api/cms/v1
PORT=3001
```

`NEXT_PUBLIC_API_URL` intentionally points to the same-origin Admin proxy. The browser calls `/cms/api-proxy/*`; the Admin server forwards requests to `DIGITALAFARIN_CMS_API_URL`.

This means a Django API hosted on another subdomain does not need to expose CMS Admin browser calls through CORS.

### 5. Add the `/cms` reverse proxy

The generated Admin contains:

```text
cms-admin/deploy/nginx.cms.conf
```

Add its location blocks to the HTTPS server block for the public website. The intended routing is:

```text
/           -> existing public Next.js site
/cms/       -> CMS Admin process on port 3001
```

Keep the generated Admin `proxy_pass` without a trailing slash so the `/cms` prefix reaches the Next.js app built with that base path.

Then build/restart the Admin process:

```bash
cd cms-admin
npm install
npm run build
PORT=3001 npm start
```

Use your normal process manager/systemd/PM2 deployment conventions in production.

### 6. Authentication behavior

v0.4 removes the demonstration username/password previously pre-filled in the login screen. Test login with a real Django user that has the appropriate CMS organization membership/role.

Verify:

```text
/cms/login
/cms/
/cms/content
/cms/media
/cms/seo
/cms/audit
```

Unauthorized, login and logout redirects should remain inside `/cms`.

### 7. Editorial transition from Django Admin

Django Admin is not removed. It can still be used for superuser maintenance, debugging and low-level recovery. However, content editors should use the visual Next.js Admin for:

- content/block editing,
- media,
- taxonomy,
- menus,
- editorial workflow,
- SEO metadata/schema,
- redirects,
- Audit/Trends,
- Search Performance/Decay,
- SEO Opportunities.

### 8. Verify the v0.4 deployment

After deployment:

1. Visit `/cms/login` on the public domain.
2. Sign in with a real CMS user.
3. Create or edit an entry and save it.
4. Verify an image can be selected/uploaded.
5. Verify publish/review workflow.
6. Open browser Network tools and confirm CMS requests go to `/cms/api-proxy/...`, not directly to the Django API subdomain.
7. Verify the public website continues serving `/` routes normally.

---

## 0.2.1 -> 0.3.0

v0.3 adds significant CMS workflow, Audit and SEO intelligence features. The package remains pre-1.0, so test the upgrade in staging before production.

## 1. Back up application data

Before upgrading a production host project, back up the database and any externally stored media.

## 2. Upgrade all synchronized packages

Python:

```bash
pip install --upgrade "digitalafarin-cms[all]==0.3.0"
```

Next.js SDK:

```bash
npm install @digitalafarin/cms-next@0.3.0
```

CLI, when installed directly:

```bash
npm install --save-dev @digitalafarin/cms-cli@0.3.0
```

## 3. Apply Django migrations

```bash
python manage.py migrate
python manage.py check
```

v0.3 introduces persisted Search Performance/import models and Audit V2 page-level data. Existing CMS data is preserved by migrations.

## 4. Review editorial workflow behavior

Publishing is now intentionally action-driven. Writers should submit content for review, while roles with publish capability use the explicit Publish/Schedule workflow actions.

If an integration previously changed an entry's `status` directly to `published` or `scheduled`, update it to use the CMS workflow endpoints instead.

## 5. Configure Site Settings

For each Site, review:

- frontend URL
- Audit base URL
- site/brand name
- title template
- default description
- default Open Graph image
- robots defaults
- global Organization schema

The public site-context endpoint exposes only an allow-listed SEO-safe subset of these settings.

## 6. Next.js metadata behavior

`cms.resolve()` can now enrich a resolved page with sanitized site SEO context. `toNextMetadata()` uses site-level defaults when an entry does not define its own values.

If your application manually applies a second title template or global metadata fallback after calling `toNextMetadata()`, review it for duplicate formatting.

## 7. Audit V2

Audit now stores page-level crawl data and uses a same-origin crawler with network-safety restrictions. Create a new Audit run after upgrading; historical data from the earlier foundation does not provide all v0.3 page metrics.

## 8. Search Performance and Content Decay

v0.3 accepts Search Console-compatible daily page metrics through its import API/admin UI.

Google OAuth credentials and automatic Google Search Console synchronization are not stored by the Community Edition in this release. Existing exports or external workers can feed the import API.

## 9. SEO Opportunity Engine

The Opportunities view is computed from available data. For the most useful results, ensure the site has:

1. published CMS entries,
2. a recent completed Audit,
3. Search Performance data covering current and baseline windows,
4. SeoMeta records and analysis where applicable.

Missing data sources do not prevent the CMS from operating; they reduce the number of intelligence signals available.

## 10. Verify the host application

Recommended smoke checks:

```bash
python -c "import digitalafarin_cms; print(digitalafarin_cms.__version__)"
python manage.py check
python manage.py showmigrations
```

For the frontend:

```bash
npm run build
```

Then verify at least one published resolver route, metadata output, menu endpoint and any scheduled publishing worker used in production.
