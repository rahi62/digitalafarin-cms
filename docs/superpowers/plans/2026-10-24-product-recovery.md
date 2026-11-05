# Product completion recovery implementation plan

Goal: resume the existing stacked draft chain without discarding or duplicating previous work.
Architecture: retain Django ownership of tenant/content/security state, Next Admin as a separate client, and explicit host-safe SDK/CLI integration. No merges, releases, publication, production deployments or production migrations.

1. Recover Git/GitHub state; preserve the original five-file working-tree patch outside the repository. Complete the existing dependency branch, rerun audit/build/installed-tarball/browser checks, commit the recovered Tiptap fix and create a draft based on #73.
2. Reproduce the documented Next 15/missing-TypeScript provisioning failure. Add negative/preservation tests before changing the scaffolder. Select compatible tooling for missing dependencies only, preserve host dependencies/configuration, validate fresh installed packages and production builds, and submit a separate stacked draft.
3. Audit existing security event sources and PR #64 safeguards. Implement the first missing unified durable security-audit slice with additive migration, allowlisted event payloads, tenant/role-scoped read-only pagination, explicit retention controls, Admin UX, and negative tests. Do not replace existing schema/registry audit history.
4. Verify each latest commit; push and create/update draft PRs. Keep PRODUCT_COMPLETION_STATUS.md as an evidence ledger with Phase/Feature/Status/Evidence/Next Action, not as a release claim. Continue with the earliest substantiated gap.

Initial recovery evidence: main 095c836; #73 fb44079 and five CI jobs green; current dependency branch c5de0c8 exists remotely but has no PR. Five modified tracked files; no stash/untracked files. #64 remains parallel and must not be merged wholesale. Fresh audit of #73 lock finds one critical and two high packages; current lock audit finds zero.
