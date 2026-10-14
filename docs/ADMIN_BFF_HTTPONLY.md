# DigitalAfarin CMS — Opt-in HttpOnly BFF Admin Authentication

**Branch:** `feat/cms-httponly-bff-auth`; Draft PR #66, dependent on PR #65 and the unfinished feature PR stack. **No merges, package publication, live migrations or deployment**.

## Security model

The CMS Admin's Next.js server becomes a Backend-for-Frontend (BFF) for browser authentication. In this opt-in mode, access and refresh JWTs are returned by Django to Next.js only; the BFF sends them to the browser as `HttpOnly; SameSite=Strict` cookies (plus `Secure` in production). Client JavaScript cannot read either token.

A distinct signed, JavaScript-readable CSRF cookie enables a strict same-origin double-submit guard. Unsafe requests must send the value through `X-CMS-CSRF`; the Next.js server additionally validates Origin and Fetch Metadata. A valid CSRF token is not permission to access tenant data: all proxied writes also require the Django access token, and Django retains its own membership and RBAC checks.

The proxy denies direct browser access to Django `/auth/*` in BFF mode and forwards only the `Authorization` header derived from its own HttpOnly access cookie. It strips any browser-supplied authorization header in this mode. Refresh is performed through a dedicated BFF endpoint with CSRF and Django's rotating blacklist refresh backend. Client requests retry at most once after a shared browser refresh attempt.

## Configuration

To opt in for standalone or embedded Admin:

```dotenv
NEXT_PUBLIC_DIGITALAFARIN_CMS_AUTH_MODE=bff
DIGITALAFARIN_CMS_BFF_SECRET=<generate-a-random-secret-of-at-least-32-characters>
DIGITALAFARIN_CMS_API_URL=http://127.0.0.1:8000/api/cms/v1
DIGITALAFARIN_CMS_PUBLIC_ORIGIN=https://your-site.example
NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH=/cms
```

Create a unique cryptographically strong `DIGITALAFARIN_CMS_BFF_SECRET` and store it in protected server environment settings; **never** use `NEXT_PUBLIC_` for this secret. Production requires HTTPS/TLS; secure cookies are enabled when `NODE_ENV=production`. All server instances must share the same BFF CSRF secret. Set `DIGITALAFARIN_CMS_PUBLIC_ORIGIN` to the exact public HTTPS origin to make strict Origin validation deterministic behind proxies.

This feature is not enabled unless `NEXT_PUBLIC_DIGITALAFARIN_CMS_AUTH_MODE=bff`. Existing bearer-token users retain the previous compatibility path until host migration. Do not run both modes for the same Admin deployment without a coordinated upgrade.

## Endpoints

| Next.js Admin endpoint | Purpose |
|---|---|
| `POST /cms/auth/session/login` | Same-origin credentials exchange; HttpOnly tokens; signed CSRF cookie; no raw token JSON |
| `POST /cms/auth/session/refresh` | CSRF-guarded refresh rotation and cookie replacement |
| `POST /cms/auth/session/logout` | Best-effort remote token blacklist followed by local cookie clearing |
| `GET /cms/auth/session/status` | Cookie-presence hint for UX, **not** proof of Django authorization |
| `/cms/api-proxy/*` | Cookie-authenticated, RBAC-enforced upstream proxy with CSRF on writes |

`/cms/route-explorer/report` also authenticates against Django using the server-held cookie, instead of expecting a browser-readable token.

## Production caveats and next tasks

- The BFF transport substantially reduces token theft through browser JavaScript; **XSS can still perform requests as a signed-in user** until blocked by broader CSP, output sanitization, and permission checks.
- Login is deliberately subject to strict Origin validation. A reverse proxy must accurately forward the public hostname/protocol; test behind the actual TLS load balancer before production.
- Logout revokes the refresh token where Django accepts it, but an already-issued stateless access JWT may continue to function until expiry. A global server-side session registry, per-session revocation/version checks and device inventory are **not yet implemented**.
- Signed double-submit CSRF guards use the host-only cookie and a private server secret; do not widen the cookie `Domain` to sibling subdomains.
- Cookies are scoped to the Admin base path; keep embedded Admin under a unique route namespace.
- The session cookies currently use conservative maximum ages; confirm Django's actual access and refresh lifetime configuration in your deployment.
- Add strict CSP, automated rate limits/lockouts on login, cache controls, and audit events for security-critical actions before treating the system as fully production-hardened.
- Rehearse the official SimpleJWT blacklist migrations (from PR #65) on staging with a verified backup.
- The browser suite `npm run test:e2e:bff` checks HttpOnly cookies, Origin/CSRF denial, authenticated proxying, refresh rotation and logout via an isolated mock upstream.

**CMS remains feature-completion-first; final real-host acceptance follows remaining feature and security work.**
