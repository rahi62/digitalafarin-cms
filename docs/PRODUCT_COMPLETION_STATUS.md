# Product completion status

Last verified: 2026-10-24. Working branch: `feat/cms-login-rate-limits`, based on Draft PR #67. **Product feature completion has not been reached.** No merge, release, deployment, or production migration is authorized.

Statuses: DONE = scoped behavior verified; PARTIAL = implementation exists but acceptance remains; BLOCKED = external dependency prevents progress; NOT STARTED = no implementation verified in this audit. Existing documentation checkboxes are not evidence of complete acceptance.

## Verified repository baseline

- Main: `095c836` (PR #56); #54–#56 are merged.
- Draft dependency chain: #57 → #58 → #59 → #60 → #61 → #62 → #63 → #65 → #66 → #67.
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
| Login-rate-limit CI | NOT STARTED | Pending Draft PR after final verification |
| Full packaging / supported-version matrix | PARTIAL | Existing CI provides coverage; fresh branch package verification pending |

## Product gaps

| Area | Status | Existing implementation and remaining acceptance |
| --- | --- | --- |
| Session registry/revocation | PARTIAL | #67 checks session IDs, logout and per-device revocation; host settings reject unsafe authenticator order with E002; CMS permissions now recheck validated session claims even under host plain JWT overrides (91 routes × 7 verbs). Full strict-mode/host custom auth matrix remains |
| Refresh concurrency/multi-instance | PARTIAL | PostgreSQL row lock now serializes managed refresh and concurrent revocation; fresh post-lock expiry check prevents expiry-during-wait bypass. Three real multi-connection regressions pass. Token-family compromise tracking, cross-tab refresh coordination and deployment compatibility mode remains an explicit transition; E003 now detects disabled rotation/blacklist and missing blacklist app |
| Login abuse protection | PARTIAL | Shared address/account/pair budgets, bounded Retry-After, Persian feedback and concurrent admission tests implemented. ATOMIC_REQUESTS bypass reproduced and fixed. Unified audit/adaptive controls remain |
| Security headers/CSP | NOT STARTED | Requires Next-compatible nonce policy and HTTPS/proxy tests |
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

## Immediate implementation sequence

1. Finish reviewable PR #64 safeguard port and authentication configuration detection; run CI.
2. Runtime enforcement implemented with API-wide replay tests; complete review and CI.
3. Managed refresh locking implemented; PostgreSQL full suite passes (164 tests, 662 subtests). Complete review and CI.
4. Add shared login abuse controls and security audit, then complete remaining P0 security before user management.

This file is an evidence ledger, not an assertion that entire phases are complete.

## Review limits

Independent focused review found no blocking issue. Proxy 503 sanitization covers failures before upstream headers arrive. A failure during an already streaming response terminates that response; the proxy does not buffer entire media/export bodies or replace a status already sent. Browser tests use an isolated upstream and do not substitute for the PostgreSQL/real-host acceptance matrix.

## Configuration detection increment

E003 rejects disabled rotation/blacklist or a missing blacklist app. Deployment-only W002/W003 report compatibility mode and missing default-database row locks. Nine focused configuration tests and six subtests pass. See SECURITY_CONFIGURATION.md for rollout and database-router limitations. Full verification: SQLite 165 tests + 666 subtests passed (3 PostgreSQL-only skips); PostgreSQL 168 tests + 666 subtests passed. Configuration/migration/diff checks pass; no new migration. These checks are not login abuse protection.

## Login rate-limiting increment

Additive migration: sites 0003_cms_login_rate_buckets. Full verification: PostgreSQL 178 tests + 673 subtests; SQLite 174 tests + 673 subtests, with four PostgreSQL-only skips. Three BFF browser tests, retry validation and Admin production build passed. Independent review identified ATOMIC_REQUESTS counter rollback; regression reproduced and fix verified. No production migration. See LOGIN_ABUSE_PROTECTION.md for policy and proxy/database limits.
