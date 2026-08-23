# @digitalafarin/cms-admin

Scaffoldable Next.js administration application for DigitalAfarin Headless SEO CMS.

The admin app is designed to run under a path such as `/cms` on the same public domain while talking to the Django CMS API.

## Scaffold

```bash
npx @digitalafarin/cms-admin scaffold \
  --dir cms-admin \
  --base-path /cms \
  --api-url https://api.example.com/api/cms/v1 \
  --port 3001
```

The command creates a standalone Next.js application containing the DigitalAfarin CMS admin UI, `.env.local`, and an Nginx location snippet.

## Generated environment

```env
NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH=/cms
NEXT_PUBLIC_API_URL=/cms/api-proxy
DIGITALAFARIN_CMS_API_URL=https://api.example.com/api/cms/v1
PORT=3001
```

The browser talks only to the same-origin `/cms/api-proxy` route. The Next.js Admin server forwards those requests to `DIGITALAFARIN_CMS_API_URL`. This avoids exposing cross-origin CMS API calls in the browser and means the Admin does not need Django CORS access when the backend lives on an API subdomain.

## Production path deployment

Build and run the generated app:

```bash
npm run build
PORT=3001 npm start
```

Then route the main website path to the admin process. The generated `deploy/nginx.cms.conf` contains the required example configuration.

For a `/cms` deployment, keep `proxy_pass` without a trailing slash so the Next.js process receives the `/cms` prefix it was built with.

The Django Admin remains available for technical maintenance, but editorial users should use the Next.js CMS Admin UI.
