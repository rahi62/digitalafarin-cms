# Managed CMS sessions — revocation contract

Branch `feat/cms-server-session-revocation` (dependent Draft PR #67 based on #66). **No merge, live migration, npm/PyPI release or production deployment.**

## Architecture

New CMS logins through `POST /api/cms/v1/auth/token/` produce a unique `cms_sid` claim within both access and refresh JWTs. A `CmsUserSession` row tracks user, expiry, limited browser User-Agent, recent activity and revocation time. The session is user-wide, not tied to a specific tenant: removing a login must revoke access to **all CMS sites** accessible to that account.

The default CMS REST authentication class is now `digitalafarin_cms.session_auth.CmsSessionJWTAuthentication`. After validating the JWT and user, every authenticated request bearing `cms_sid` verifies that the backing session belongs to that user, has not been revoked and has not expired. **An unexpired access JWT is rejected immediately after its session is revoked**, rather than awaiting its normal `exp`. Refresh is independently checked against the same record; rotating refresh tokens preserve `cms_sid`.

Django's JWT blacklist remains in use to prevent reuse of rotated or logged-out refresh JWTs. Database-backed session revocation and blacklist support complement one another.

## Authenticated API

Under `/api/cms/v1/auth/sessions/`:
- `GET /` — up to 50 recent **current user's** sessions, activity, expiry, active/current flags, and nontrusted User-Agent metadata. No credentials or token hashes are returned.
- `POST /<uuid>/revoke/` — revoke one session owned by the current user (returns 404 for other users' sessions).
- `POST /revoke-others/` — revoke all other active sessions while retaining the current managed session.
- `POST /revoke-all/` with `{"confirm":true}` — revoke all sessions including the current one, immediately denying further CMS requests with those access tokens.

`POST /auth/logout/` additionally marks the managed session revoked when the provided refresh JWT belongs to that session and user. Changing a session status requires an authenticated request and the ordinary BFF same-origin and CSRF checks when BFF is enabled.

## Admin UX

The `/cms/security/sessions` screen lists account sessions with current/active/revoked indicators. It supports revoking a session, revoking other devices and logging out everywhere. The latter clears BFF cookies through local logout and returns the browser to login. A `BroadcastChannel` notification sends **logout events only** to sibling browser tabs, never access or refresh token material.

## Compatibility and prerequisites

- `apps/sites/migrations/0002_cms_user_sessions.py` creates one new table and index, without rewriting existing published CMS content. Rehearse with verified Postgres backup on staging before installing.
- CMS default settings use session-checked JWT authentication, **but if a host project overrides `REST_FRAMEWORK.DEFAULT_AUTHENTICATION_CLASSES`, it MUST put `CmsSessionJWTAuthentication` (or a subclass) first. Django system check `digitalafarin_cms.E002` rejects missing, unimportable or earlier bypassing authenticators. Keep host authenticators after it. Protected CMS handlers also use `CmsIsAuthenticated`, which rechecks already authenticated session claims against the request user. Thus a host/plain JWT per-view override cannot bypass revocation. Strict managed-session mode also rejects authenticated host sessions or legacy tokens without `cms_sid`; compatibility mode preserves them.**
- Pre-existing access/refresh JWTs without `cms_sid` are provisionally accepted unless `DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS=True`. Enable strict mode only after client and server rollout planning, otherwise legacy sessions can bypass this revocation registry. For production after rollout, strict mode is strongly recommended.
- A host running multiple app instances must use the **same transactional database**. Stateless copies of this registry or stale query caches void the immediate-revocation guarantee.
- Device labels derive from untrusted user-agent strings; they are informational, not cryptographically verified device identities.
- A revoked browser session is invalid on its **next authenticated CMS API request**; this is not a real-time push disconnect for idle browsers or existing long-running work.
- No session IP tracking, geolocation claims, MFA, account-wide emergency password reset, centralized security audit stream, or login throttling in this phase. No permanent deletion of session history.
- Standalone and embedded Next Admin builds must forward `/auth/sessions/*` through their BFF proxy; direct token obtain/refresh remains restricted.

## Tests and release gate

Django tests cover two independently issued sessions, refresh rotation, immediate API denial after revocation, cross-account protection, owner-only session view, current/all/others revocation, logout, and strict legacy-token rejection. Browser E2E covers independent BFF sessions, per-account revocation and cookie cleanup.

**Do not deploy before migration rehearsal and host-client verification. No code was merged into main.**

## Runtime enforcement regression

The replay test discovers all 91 currently protected URL patterns, substitutes host `JWTAuthentication`, proves live access first, revokes the backing session and requires denial for GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS (637 requests). Public `AllowAny` endpoints retain their existing behavior. CMS permissions only inspect verified `Token`/mapping authentication results, never unsigned raw headers. Hosts defining new CMS endpoints must use `CmsIsAuthenticated`; removing the CMS permission itself is outside the supported integration contract.
