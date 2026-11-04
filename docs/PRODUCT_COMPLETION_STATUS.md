# Product completion status

Last verified: 2026-10-24. Working branch: `fix/cms-dependency-security-patches`, based on Draft PR #73. **Product feature completion has not been reached.** No merge, release, deployment, or production migration is authorized.

Statuses: DONE = scoped behavior verified; PARTIAL = implementation exists but acceptance remains; BLOCKED = external dependency prevents progress; NOT STARTED = no implementation verified in this audit. Existing documentation checkboxes are not evidence of complete acceptance.

## Verified repository baseline

- Main: `095c836` (PR #56); #54–#56 are merged.
- Draft dependency chain: #57 → #58 → #59 → #60 → #61 → #62 → #63 → #65 → #66 → #67 → #68 → #69 → #70 → #71 → #72 → #73.
- Parallel #64 branches from #63; not merged or cherry-picked wholesale.
- #65–#67 latest existing CI: Python 3.11/3.12/3.13 and Node succeeded. #64 Node failed; Python succeeded.
- Other open PRs: #33, #46, #50–#53. Dependency upgrades and host-hardening changes require separate compatibility review.

## Phase 0 and PR #64 comparison

| Capability | Status | Evidence / gap |
| --- | --- | --- |
| PR dependency graph | DONE | GitHub open PR bases and heads inspected |
| Authentication branch comparison | PARTIAL | Source/test comparison complete for session and proxy paths; full host E2E parity still pending |
| #64 upstream manual redirects/timeouts | DONE | #66 already has these for token exchange; general proxy gains bounded requests and sanitized 503 handling |
| #64 decoded endpoint segment validation | DONE | Ported to current proxy; traversal, encoded separators, control characters tested |
| #64 token rotation/logout tests | PARTIAL | Equivalent core coverage in #65/#67; #64 generic blacklist endpoint intentionally not introduced (would bypass managed-session logout semantics) |
| #64 browser security tests | PARTIAL | Existing BFF suite covers token exposure/CSRF; standalone host fixture parity still pending |
| Migration graph and drift | DONE | Django system check and makemigrations --check --dry-run passed on working stack; no new migration |
| Clean/existing-host integration | PARTIAL | 28 SDK/CLI integration tests pass, including preservation of existing routes and embedded styles; clean packed installation and real-host browser tests still pending |
| Backend baseline | DONE | 161 tests + 662 subtests pass locally on Python 3.12 after runtime enforcement; 23 warnings remain |
| Admin typecheck | DONE | tsc --noEmit passed |
| BFF browser regression | DONE | 2 tests passed with installed Chrome via CMS_E2E_BROWSER_PATH; CDN Chromium download returns location-based HTTP 403 |
| Proxy safeguards | DONE | 4 Node tests cover invalid paths, upstream disconnect, manual redirects and the 20-second timeout |
| Admin production build | DONE | next build passed locally |
| PR #68 CI | DONE | Commit 7756dd7: Node and Python 3.11/3.12/3.13 all passed (run 40020523726) |
| PR #69 runtime enforcement CI | DONE | Commit a71d1ce: all four jobs passed on rerun; initial Node editor-create timeout remains an intermittent issue |
| PR #70 refresh locking CI | DONE | Commit bca7d71: Node, PostgreSQL and Python 3.11/3.12/3.13 all passed (run 40029942477) |
| PR #71 configuration checks CI | DONE | Commit 7888434: all five jobs passed (run 40030720391) |
| PR #72 login limits CI | DONE | Commit 5384a13: all five jobs passed (run 40032472400) |
| PR #73 CSP/header CI | DONE | Commit fb44079: all five jobs passed (run 40069835379) |
| Dependency-security CI | NOT STARTED | Local recovery gates passed; Draft PR/CI pending |
| Full packaging / supported-version matrix | PARTIAL | Existing CI provides coverage; fresh branch package verification pending |

## Product gaps

| Area | Status | Existing implementation and remaining acceptance |
| --- | --- | --- |
| Session registry/revocation | PARTIAL | #67 checks session IDs, logout and per-device revocation; host settings reject unsafe authenticator order with E002; CMS permissions now recheck validated session claims even under host plain JWT overrides (91 routes × 7 verbs). Full strict-mode/host custom auth matrix remains |
| Refresh concurrency/multi-instance | PARTIAL | PostgreSQL row lock now serializes managed refresh and concurrent revocation; fresh post-lock expiry check prevents expiry-during-wait bypass. Three real multi-connection regressions pass. Token-family compromise tracking, cross-tab refresh coordination and deployment compatibility mode remains an explicit transition; E003 now detects disabled rotation/blacklist and missing blacklist app |
| Login abuse protection | PARTIAL | Shared address/account/pair budgets, bounded Retry-After, Persian feedback and concurrent admission tests implemented. ATOMIC_REQUESTS bypass reproduced and fixed. Unified audit/adaptive controls remain |
| Security headers/CSP | PARTIAL | Standalone per-request nonce CSP and browser headers implemented; production parser blocks untrusted script/style, Tiptap nonce verified. Host composition and actual HTTPS/proxy/version matrix remain |
| Security audit | PARTIAL | Schema/component approval events exist; unified authentication/security event stream missing |
| User/team management | PARTIAL | Membership/role APIs and Admin exist; invitations, account recovery, ownership transfer and full role matrix acceptance remain |
| Content schema | PARTIAL | Typed fields, nested structures, relations, singleton support exist; controlled migration only supports bounded root rename |
| Editorial workflow | PARTIAL | Published snapshots, revisions, scheduling, trash/restore exist; editor concurrency, autosave/conflict and SEO snapshot acceptance need full audit |
| Reusable blocks | PARTIAL | Independent copies exist; controlled globally synced publication/versioning remains |
| Hybrid integration | PARTIAL | Host-owned registries, persisted drafts, approval/rollback/checksums exist; deployment reporting, dynamic binding and full host verification remain |
| Admin/onboarding | PARTIAL | Persian RTL Admin exists; complete permission-aware lifecycle, accessibility/mobile and diagnostic acceptance remain |
| Media/menu/taxonomy/SEO | PARTIAL | Existing modules and public SDK exist; complete CRUD, dependency integrity and upload-abuse acceptance remain |
| Bulk/import/export | NOT STARTED | No complete operational workflow verified |
| Background jobs/operations | PARTIAL | Celery dependency and audit workflows exist; retry/cancellation/health/dead-letter acceptance remain |
| SDK/extensions/webhooks | PARTIAL | Typed public SDK exists; full API versioning, webhook retry/idempotency and extension safety acceptance remain |
| Comprehensive QA | PARTIAL | Existing automated suites pass locally as recorded; PostgreSQL concurrency, supported runtimes and browser/host matrix remain |
| Release candidate | NOT STARTED | Requires P0/P1 completion, backup restore, upgrade/install and explicit release authorization |


## Recovery checkpoint and phase evidence (2026-10-24)

`c5de0c8` was already pushed on `fix/cms-dependency-security-patches`; no PR existed for it at recovery. The working tree contained five tracked Tiptap/menu dependency and package-smoke changes. They were preserved in `/home/rahiwebmaster/cms-recovery/pre-recovery-working-tree.patch`. No stash, untracked files, reset, clean, force push or history rewrite. #73 remains the latest open feature draft, with all five jobs successful on `fb44079`. New working-tree claims below require fresh verification; earlier checkpoints are historical evidence only.

| Phase | Feature | Status | Evidence | Next Action |
| --- | --- | --- | --- | --- |
| Recovery | Git and draft dependency chain | DONE | Local status/log/reflog/stashes, fetch, remote PR bases and Actions inspected; original patch preserved | Keep each incremental change on a separate stacked draft |
| P0 Security | Dependency patches and fresh package graph | DONE | Fresh audit: #73 has 1 critical/2 high packages, patched graph zero; 10 Admin + 29 SDK/CLI tests; typecheck/build; fresh standalone and embedded package graphs/build; 2 CSP + 7 editor + 3 BFF browser tests pass | Obtain latest-SHA CI on stacked dependency draft; next packaging gap is Next 15 tooling |
| P0 Integration | Next 15 missing-tooling provisioning | PARTIAL | `apps/admin/bin/scaffold.js` installs unversioned tooling; documented TypeScript 7 lacks the compiler API used by Next 15 | Reproduce, constrain only newly provisioned tooling, preserve declared host versions |
| P0 Security | Authentication/session/refresh and #64 parity | PARTIAL | `session_auth.py`, `user_sessions.py`, BFF and proxy-security tests; #68 ports decoded-path/timeouts; #69–#72 enforce revocation/locking/login budgets | Host TLS/strict-mode acceptance; do not cherry-pick the parallel #64 auth contract |
| P0 Security | CSP and browser headers | PARTIAL | #73 nonce middleware, policy tests and production browser suite; five CI jobs green | Retain browser regression and finish real host/proxy acceptance |
| P0 Security | Durable security audit | PARTIAL | `ContentSchemaMigration` and component approval history exist; no unified authentication/role/session event model/API/Admin | Add scoped durable event stream, safe payloads, pagination/retention and negative tests |
| P0 Users | User management and invitations | PARTIAL | `sites/views.py`, membership serializers, Admin team page and owner-role tests; no invitation model or acceptance lifecycle | Add invitations/recovery after security event foundation |
| P0 Schema | Schema migration engine | PARTIAL | `CONTROLLED_SCHEMA_MIGRATION.md`, root rename service/migration and API tests; bounded root-only operation | Versioned compatibility, published snapshots, broader transforms and rollback acceptance |
| P0 Editorial | Workflow/revisions/autosave | PARTIAL | Content models/publication service, revision/editorial/trash tests and Admin editor | Verify concurrency/conflict UX and meaningful revisions end to end |
| P0 Hybrid | Routing/component registry | PARTIAL | SDK/CLI route discovery, explicit host bindings, persisted drafts and approval/rollback tests | Real-host parity, deployment reporting and dynamic route acceptance |
| P0 Admin | Onboarding/admin UX | PARTIAL | Existing RTL screens, sidebar/mobile and schema-driven forms; no full lifecycle/role/a11y acceptance | Permission-aware onboarding, keyboard/mobile/error-state verification |
| P0 Content | Media/menus/taxonomies/SEO | PARTIAL | Existing backend models/API/tests and Admin pages | Audit full CRUD, reference integrity, upload abuse and UX before marking complete |
| P1 Content | Bulk operations | NOT STARTED | No complete bulk-operation API/UI/test workflow verified | Implement bounded role/tenant-safe operations |
| P1 Content | Safe import/export | NOT STARTED | No complete media/redirect conflict-reporting workflow verified | Design preview/validation and non-destructive execution |
| P1 Operations | Jobs/operational dashboard | PARTIAL | Celery and SEO audit workflows exist; no unified retry/cancel/dead-letter acceptance | Verify actual queue lifecycle and diagnostics |
| P1 SDK | SDK/CLI/extensions/docs | PARTIAL | Typed SDK, packed-package smoke and host integration tests | Finish supported toolchain matrix, webhook retry/idempotency and documentation parity |
| QA | Security/integration acceptance | PARTIAL | Existing Node/Python/PostgreSQL/Playwright suites; local recovery rerun underway | Fresh latest-SHA CI and installed-host matrix, migration rehearsal |
| RC | Release candidate | NOT STARTED | P0/P1 and release checklist remain open | No tag/publication/deploy without explicit approval |

Evidence distinguishes implemented backend/frontend/permissions/migrations/tests from complete product UX. `PARTIAL` rows must not be promoted solely because a commit or CI run exists.

## Immediate implementation sequence

1. Finish the recovered Tiptap installed-package fix on the existing dependency branch and submit its missing draft PR based on #73.
2. Resolve missing-tooling provisioning for Next 15 hosts without changing their declared toolchain.
3. Add the missing unified security-audit stream; preserve existing schema and component audit records.
4. Continue the first verified P0 gap. Existing role/session/schema/registry foundations must not be reimplemented.

This file is an evidence ledger, not an assertion that entire phases are complete.

## Fresh editor package dependency increment

On 2026-10-24, reproduced the remaining Tiptap packaging gap in a freshly generated standalone Admin: optional menus resolved to 3.32.0 against core/pm 3.31.3 and `npm ls` exited 1 (`ELSPROBLEMS`). Explicit menu dependencies now keep this editor set at 3.31.3. Packed standalone and embedded installations pass dependency checks, and the embedded consumer production build passes. The tarball smoke script checks both fresh graphs in CI. Seven editor browser tests, 29 SDK/CLI tests, ten Admin tests and Admin typecheck pass; repository audit reports zero vulnerabilities. Focused independent review found no blocking issue. Next's nested-fixture workspace-root warning remains; the TypeScript 7 / Next 15 provisioning gap remains open. No merge, release, deployment or production migration was performed.

## Review limits

Independent focused review found no blocking issue. Proxy 503 sanitization covers failures before upstream headers arrive. A failure during an already streaming response terminates that response; the proxy does not buffer entire media/export bodies or replace a status already sent. Browser tests use an isolated upstream and do not substitute for the PostgreSQL/real-host acceptance matrix.

## Configuration detection increment

E003 rejects disabled rotation/blacklist or a missing blacklist app. Deployment-only W002/W003 report compatibility mode and missing default-database row locks. Nine focused configuration tests and six subtests pass. See SECURITY_CONFIGURATION.md for rollout and database-router limitations. Full verification: SQLite 165 tests + 666 subtests passed (3 PostgreSQL-only skips); PostgreSQL 168 tests + 666 subtests passed. Configuration/migration/diff checks pass; no new migration. These checks are not login abuse protection.

## Login rate-limiting increment

Additive migration: sites 0003_cms_login_rate_buckets. Full verification: PostgreSQL 178 tests + 673 subtests; SQLite 174 tests + 673 subtests, with four PostgreSQL-only skips. Three BFF browser tests, retry validation and Admin production build passed. Independent review identified ATOMIC_REQUESTS counter rollback; regression reproduced and fix verified. No production migration. See LOGIN_ABUSE_PROTECTION.md for policy and proxy/database limits.

## Admin header increment

Production build and typecheck pass. Two production browser tests verify nonce freshness/spoof rejection, script/style injection denial, framework hydration and accepted Tiptap styles. Seven editor and three BFF browser tests pass; five CSP policy tests and 29 SDK/CLI tests pass. Host middleware/layout byte preservation is covered. Review found Tiptap unnonced stylesheet injection; regression reproduced and corrected using injectNonce. No new migration. See ADMIN_SECURITY_HEADERS.md for reviewed style-attribute exception and explicit embedded-host composition.

## Dependency security finding

The registry audit at the header checkpoint reports three vulnerable installed packages: Next.js (critical), sharp (high), source-map-js (high). Primary GitHub advisories confirm affected ranges. Current stable patches verified from the registry: Next 16.4.3, sharp 0.35.5, source-map-js 1.2.2. A separate immediate dependency increment will update the owned manifests/lockfile and repeat audit/build/browser checks; this finding is not marked fixed until verified.

## Dependency patch verification

Targeted lock update resolves Next 16.4.3, sharp 0.35.5 and source-map-js 1.2.2; repository audit reports zero vulnerabilities. Admin/public example builds, 29 SDK/CLI tests, production CSP/editor two tests, editor seven and BFF three pass. Isolated Next 15.5.28 + TypeScript 5.9.3 + Next-scoped PostCSS 8.5.23 override passes audit (zero findings), build and production browser probe. Stock Next 15 retains vulnerable PostCSS; hosts must explicitly review the scoped override or use default Next 16. Next 15 + TypeScript 7 config-loader failure and fresh Tiptap optional-peer warnings remain packaging gaps, not silently completed. Packed SDK/CLI/Admin installation and clean embedded consumer build also pass; patched sharp native encode/decode passes. See SECURITY_DEPENDENCY_PATCHES.md.

## Recovery verification increment

Freshly rerun on the preserved dependency working tree: npm audit reports zero findings versus one critical and two high packages on the #73 lockfile; npm dependency graph is coherent; 10 Admin tests, 29 SDK/CLI tests, Admin typecheck/production build, installed standalone/embedded tarball checks and embedded production build pass. Playwright with local Chrome: 2 production CSP tests, 7 editor/registry tests and 3 BFF tests pass. Next-generated local next-env/tsconfig edits were archived outside Git and restored to their original tracked content; the generated Next agent guide is retained. The initial five-file patch remains backed up. No whole-product completion or new CI success is claimed.
