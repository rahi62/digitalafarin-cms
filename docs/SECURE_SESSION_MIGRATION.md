# CMS Secure Session Migration — Auth hardening P0

**Development branch:** `feat/cms-http-only-session-auth` (Draft PR #64, dependent on #63–#57). Not merged/published/deployed.

## Changed authentication architecture

**Previously:** browser JWT access/refresh tokens were stored in `localStorage` and passed as an `Authorization: Bearer` header. Any JavaScript executing in the admin origin could read both tokens.

**Now:** the Next.js Admin acts as a first-party Backend-for-Frontend (BFF). Django SimpleJWT issues tokens server-to-server; the BFF stores them in **HttpOnly, SameSite=Strict cookies scoped to the Admin base path** (`/cms` by default), with `Secure` in production. Browser JavaScript **never receives access or refresh JWTs**.

- `POST /cms/session/login` — accepts username/password, exchanges them with Django over server-side transport, responds with a generic `authenticated: true` JSON payload and sets both HttpOnly cookies.
- `POST /cms/session/refresh` — uses only the HttpOnly refresh cookie and replaces **both** cookies after SimpleJWT token rotation. Old refresh token is blacklisted.
- `POST /cms/session/logout` — attempts to blacklist the refresh token in Django and clears browser cookies, even when Django cannot be reached. Response includes `refresh_revoked` for operational visibility.
- `GET /cms/session/status` — verifies current access token against a tenant-scoped Django endpoint. A failed check can trigger a single refresh in the client.
- `/cms/api-proxy/*` — forwards the access cookie as `Authorization` server-side; ignores any browser-supplied bearer header and rejects direct browser access to `auth/token/*` endpoints (no raw token leakage through proxy).
- Route Explorer report uses the same server-side cookie, not browser-accessible JWT.
- Browser `apiFetch` refreshes once on `401` (in-flight request sharing within one tab), retries once and sends the user to login only on definitive session expiry. Temporary `503` errors are shown rather than incorrectly interpreted as logout.
- Old `localStorage` keys are cleared on Admin mount, login and successful logout.

## CSRF and cookie constraints

All mutating Admin proxy and session calls require `X-CMS-Request: 1`; requests with an incompatible `Origin` or `Sec-Fetch-Site` are denied. SameSite Strict cookies further reduce CSRF. These defenses **do not** make arbitrary XSS safe: never execute untrusted content or HTML in the Admin.

Cookies are scoped to `NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH`; `Secure` cookies in production require **HTTPS**. Misconfigured TLS termination, cookie path/domain, reverse proxies or cross-origin embedding will break login and must be tested in staging. An external browser API origin is intentionally not supported by this cookie-only Admin design; Django upstream URL remains server-only.

## Django token policy

The CMS defaults now include the SimpleJWT `token_blacklist` app and set:

- `ROTATE_REFRESH_TOKENS=True`
- `BLACKLIST_AFTER_ROTATION=True`
- Access token lifetime default 10 minutes, refresh lifetime default 7 days (can be further reduced per host security policy).
- New `/auth/token/blacklist/` endpoint for revocation of refresh tokens at logout.

**Host overrides take precedence** because `apply_defaults` uses `setdefault`. If the host overrides token rotation or drops the blacklist app, secure refresh behavior is not guaranteed. This release requires documenting/enforcing host SimpleJWT settings and running Django's **token_blacklist migrations** before any new Admin session route is deployed.

**Important limitation:** logout invalidates the refresh token, not all previously minted access JWTs; a stolen access token may remain valid until its configured expiry. Token blacklist maintenance (expired outstanding token cleanup) must be scheduled. Concurrent refresh from multiple browser tabs may conflict due to rotation; robust cross-tab refresh coordination is still outstanding. Additional login brute-force rate limiting, session inventory/forced revoke, and CSP review remain security work; **do not declare production security complete**.

## Deployment sequence (not performed)

1. Verify database backup/restore capability and HTTPS reverse proxy configuration.
2. Install the Django CMS upgrade in staging, preserve host settings, verify `rest_framework_simplejwt.token_blacklist`, `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION`.
3. Run `python manage.py migrate` on a **staging database**, including SimpleJWT blacklist migrations; test refresh rotation and logout.
4. Deploy the corresponding Next.js Admin/BFF routes **together** (standalone or embedded), over HTTPS with a stable `/cms` base path.
5. Test login, refresh after expiry, navigation, multi-tab behavior, logout, tenant ACL and host route ownership. Old localStorage sessions must sign in again.
6. Check logs for unexpected 401/403/503 and stale cookies. Only plan production rollout after explicit approval and a rollback plan.

## Test coverage

- Django tests validate JWT obtain, refresh rotation, one-time refresh use and blacklist on logout.
- Playwright exercises unauthenticated denial, CSRF rules, token-route isolation and continued editorial/registry UI with cookie-session fixtures.
- npm packaging/Next.js host integration CI remains required. Do not equate CI with real production-host acceptance.

**No merge, npm/PyPI publication, server deploy, or production database migration was performed.**
