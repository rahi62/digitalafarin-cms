# Validation - v0.8.0

Evidence from the release-candidate run on branch `release/v0.8.0`. Code under test: commit `25b211a` (the documentation commits that follow change no code). Raw logs: `docs/validation/0.8.0/` (host checks, JSON) - the command log is reproduced below.

## Environment

| Item | Value |
|---|---|
| OS | Ubuntu 24.04 (WSL2), repository cloned inside the Linux filesystem |
| Python | 3.12.3 |
| Django | 6.0.10 (default venv) and 5.2.19 (second venv) |
| PostgreSQL | 16.15 (local, port 5433, test role only) |
| Node / npm | 24.16.0 / 11.13.0 |
| Next.js | 16.4.3 (repo workspace), 16.4.5 (both verification hosts, `create-next-app@16`) |

## Automated suites

| Command | Result |
|---|---|
| `pytest packages/cms-django/tests` - SQLite, Django 6.0 | 277 passed, 5 skipped (PostgreSQL-only), 725 subtests |
| same - PostgreSQL, Django 6.0 | 282 passed, 725 subtests |
| same - PostgreSQL, strict managed sessions (`tests.strict_settings`), Django 6.0 | 282 passed, 725 subtests |
| same three - Django 5.2.19 | 277 + 5 skipped / 282 / 282 passed |
| `python -m django check` | no issues |
| `python -m django makemigrations --check --dry-run` | No changes detected |
| `scripts/verify-routing-migration.py` | exit 0 |
| `scripts/smoke-python-package.py` on the built wheel | installed wheel, Django setup, migrations and URL wiring OK |
| `npm ci --ignore-scripts` | exit 0 |
| `npm run check:versions` | all packages and lockfile at 0.8.0 |
| `node --experimental-strip-types --test apps/admin/test/*.test.mjs` | exit 0 |
| `npm --workspace packages/cms-next run build / typecheck / test:rich-text` | exit 0 |
| `npm run test:integration` (SDK + CLI `node --test`) | exit 0 (66 tests in the last local run) |
| `npm --workspace apps/admin run typecheck / build` | exit 0 |
| `npm audit` | found 0 vulnerabilities |
| `pip-audit` | **not run here**: PyPI's audit API timed out from this machine. Added to CI (`python-audit` job). |

## Installation verification (artifacts built from HEAD: wheel + 3 npm tarballs, installed only from local files)

Evidence files: `HostA.json`, `HostB.json`, `HostB-extra.json`.

| Check | Host A (fresh Django 5.2 + PostgreSQL, fresh Next 16, `cacheComponents` ON) | Host B (split settings, host DRF Session+LimitOffset, existing routes, `cacheComponents` OFF) |
|---|---|---|
| migrate, superuser | pass | pass |
| Admin login: httpOnly cookies, no tokens in body/HTML (HTTP level) | pass | pass |
| logout, API denied afterwards | pass | pass |
| site + content type + webhook endpoint | pass | pass |
| draft hidden, publish, page via catch-all | pass | pass |
| title / description / canonical / JSON-LD | pass | pass |
| existing host route wins | pass (`/`) | pass (`/`, `/about`, `/products/widget`, host API route, host `next.config` redirect) |
| missing page | noindex 404 page, status 200 (Next streaming behaviour, see Known limitations) | real 404 |
| preview: renders draft, noindex, `no-store`, hidden without token | pass | pass |
| redirect | streamed Next redirect (308, client-side) | HTTP 308 with `Location` |
| sitemap lists page; `lastmod` changes after republish | pass | pass |
| robots: admin/preview blocked, sitemap line; `Disallow: /` when `robots_index=false` | pass | pass |
| webhook revalidation updates the page without rebuild (page stays stale until delivery) | pass | pass |
| one `content.published` event per publish | pass | pass |
| `/api/cms/v1/health/` | `{"status":"ok","version":"0.8.0"}` | same |
| settings/urls wiring | n/a | auto-detected `config/settings/dev.py` + `ROOT_URLCONF`; and via `--settings-file base.py --urls-file config/urls.py` |
| host DRF unchanged (limit/offset shape, PAGE_SIZE, 403 for anonymous, bearer ignored, effective `REST_FRAMEWORK` identical) | n/a | pass (20/20 extra checks) |

Totals: Host A 35/35, Host B 35/35, Host B extra 20/20.

## What was not verified

- Browser-level behaviour of the Admin (that nothing is placed in `localStorage`) was checked only at HTTP level: cookies are `HttpOnly`, and no token appears in any response body or HTML.
- `pip-audit` (see above).
- The Celery path of webhook delivery was unit-tested (enqueue on commit, broker failure keeps the row pending); the verification hosts used `DIGITALAFARIN_CMS_WEBHOOK_DISPATCH = "manual"` with `cms_drain_webhooks`.
- No load test beyond the 2,000-entry query-count test.

## Known limitations

- `cacheComponents` hosts with Partial Prefetching: missing CMS pages are served as a noindex 404 page with HTTP 200 and redirects as streamed client-side 308s. Next.js documents Proxy as the way to get real status codes.
- With `trailingSlash: false` (Next default) CMS URLs, which end in `/`, answer with an extra 308 from the slash form.
- The SDK's replay store is process-local unless a shared store is supplied.
- Component registry / visual binding / approvals are experimental.
