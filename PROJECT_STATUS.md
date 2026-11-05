# Project status - v0.8.0 (release candidate)

Evidence-based: see `VALIDATION.md` for commands, versions and per-host results. Branch `release/v0.8.0`, code verified at `25b211a`.

## Supported in 0.8.0

| Area | State |
|---|---|
| Multi-tenant content, taxonomy, menus, reusable blocks, revisions, trash | supported; tenancy fails closed |
| Published snapshots, indexed resolver (`normalized_path`), public collection API | supported |
| SEO metadata, JSON-LD, redirects (atomic hit counter), sitemap (index + children), robots from site settings | supported |
| Media library with server-side validation | supported |
| Signed webhooks + SDK revalidation handler, tagged SDK fetches | supported |
| Managed sessions (strict by default), httpOnly BFF Admin session | supported |
| Scheduled publishing, health endpoint, structured logging | supported |
| Embedded Admin, CLI (`init`, split settings, `--with-revalidate`) | supported |
| Next.js 16 (`cacheComponents` on and off), Django 5.2 and 6.0, PostgreSQL 16 | verified |

## Experimental (no compatibility promise)

Component registry, visual component binding, binding drafts, approvals and rollback.

## Not verified / open

- `pip-audit` not executed locally (PyPI unreachable); runs in CI.
- Admin `localStorage` content not inspected in a real browser.
- CMS 404/redirect status codes on `cacheComponents` hosts are streamed (see `VALIDATION.md`). Keep `cacheComponents` OFF for SEO-critical sites; the CLI warns when it is on.

## Next milestone: 0.8.1

- Real 404/308 status codes on `cacheComponents` hosts through `proxy.ts` (resolve the path before streaming starts).
- Python 3.11 and 3.13 are covered by CI only; this run used 3.12.

## Out of scope for 0.8

Multilingual/hreflang, AI features, billing/licensing, code-first content types, migrations from Wagtail/Payload.
