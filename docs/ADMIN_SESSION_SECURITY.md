# Admin Session Security — incremental P0

Draft PR #65 on `feat/cms-auth-refresh-session`, based on PR #63 and its Draft dependency chain. **No merge, deployment, package publish or live migration.**

## Implemented

- Admin login now keeps new access/refresh tokens in browser `sessionStorage` rather than long-lived `localStorage`, and clears legacy persistent credentials after login/logout.
- The HTTP client retries a **single** failed request after a **single-flight** refresh, avoiding parallel concurrent refresh-token rotation races.
- When refreshed token is returned, it replaces the old refresh token. Refresh is never retried indefinitely.
- On expiry/failure, local credentials are cleared and the admin is redirected to login.
- Logout clears local tokens, then attempts authenticated `POST /auth/logout/` to blacklist the refresh token. The UI navigates after the network attempt.
- Django adds SimpleJWT's official `token_blacklist` app to CMS default installed apps; `ROTATE_REFRESH_TOKENS` and `BLACKLIST_AFTER_ROTATION` are enabled by defaults **unless overridden by host settings**.
- Logout requires an authenticated access JWT and a refresh JWT belonging to the same user. Refresh replay following rotation or blacklist is rejected server-side.
- Django regression tests cover refresh-token reuse denial, logout, cross-user revocation attempts, and invalid requests.

## Security limitations (explicit)

This is transitional security hardening, **not complete browser token isolation**:
- Both tokens remain accessible to JavaScript through `sessionStorage`; XSS could steal them. An opt-in same-origin BFF with server-held refresh token and `HttpOnly; Secure; SameSite` cookies is the target architecture.
- A blacklisted refresh token does not invalidate an already-issued stateless access JWT. For emergency revocation, use short access lifetimes, per-user/session token versions or denylisting checked on every request.
- Existing authenticated tabs may carry an older access token until expiry, even after logout in another tab.
- Do not run the authenticated logout network request after navigation; wait for completion or a controlled timeout. Logout clears the browser credentials before the network attempt, so a network failure does not restore the local session.
- Existing host custom `SIMPLE_JWT` settings can override the new defaults; review them carefully before deployment.

## Rollout requirements

- The blacklist app adds official SimpleJWT migrations. Back up the database and run `python manage.py migrate token_blacklist` in staging, rehearse install/upgrade, then coordinate app deployment.
- Confirm migrations and update old clients before enabling refresh rotation on any shared authentication backend.
- Configure TLS and secure production CORS/CSP. Do not introduce browser storage of long-lived service credentials.
- Track logout/replay errors without logging token material.
- Browser end-to-end acceptance on a real consumer project is deferred until the user's feature completion gate.

## Next

Implement same-origin BFF `HttpOnly` session transport, CSRF protection, cross-tab logout propagation, session inventory/revocation and rigorous host deployment acceptance before claiming production-grade authentication.
