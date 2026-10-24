# Security dependency patches (2026-10-24)

The previous lockfile resolved Next 16.3.1, sharp 0.35.3 and source-map-js 1.2.1. The registry audit reported one critical and two high-severity vulnerable packages. The targeted update resolves Next 16.4.3, sharp 0.35.5 and source-map-js 1.2.2, including their matching SWC/native libvips packages. The updated repository audit reports zero vulnerabilities at this checkpoint.

Primary advisory examples:

- [Next.js advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36)
- [sharp/libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)
- [source-map-js denial-of-service advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)

The Next audit includes additional advisories beyond these examples. A clean audit is a current dependency check, not a claim that all application security work is complete.

## Host minimums and compatibility

Admin API-compatible peer ranges now require Next 15.5.28 or 16.4.3 (or compatible subsequent patches in those majors). The default/recommended audited runtime is Next 16.4.3. Next 15 additionally requires the reviewed PostCSS override below; its stock transitive graph is not security-clean. SDK peers receive the same lower-version floors; its previous Next 17 allowance remains unchanged and is **not** a verified compatibility claim.

Hosts on older versions must review and upgrade their own Next dependency/lockfile. CMS does not rewrite host routes, layouts, middleware or application source. Public API contracts, package version 0.7.0 and Django migrations are unchanged by this dependency increment; no package is published.

Verified locally:

- Next 16.4.3: Admin and public example build, typecheck, 29 SDK/CLI tests, two production CSP/editor tests, seven editor tests and three BFF tests.
- An isolated generated Admin with Next 15.5.28, TypeScript 5.9.3 and a Next-scoped PostCSS 8.5.23 override: zero audit findings, production build and the same two CSP/editor tests.
- Patched sharp native encode/decode passes. Packed SDK import, installed CLI execution and clean embedded Admin integration/build pass. Registry audit reports zero findings on the default graph and on the explicitly overridden Next 15 fixture.

Reproduce the production browser probe against an independently built scaffold with `CMS_E2E_STANDALONE_DIR` pointing to that directory. Run it separately from the default probe because they share a port.

## Conditional Next 15 security configuration

The stock Next 15.5.28 fixture audited vulnerable PostCSS dependencies. The following **Next-scoped** fixture override resolved them without replacing unrelated host PostCSS pipelines:

```json
{
  "overrides": {
    "next@15.5.28": { "postcss": "8.5.23" }
  }
}
```

Review and merge this into the host package-manager configuration if retaining that exact Next release, then regenerate/audit the host lockfile and test its build. Preserve existing overrides. CMS never writes this automatically. The fixture with this override passed audit/build/browser verification; a future Next maintenance release needs its own audit. [PostCSS advisory example](https://github.com/advisories/GHSA-r28c-9q8g-f849).

## Remaining packaging gaps

The Next 15 probe with TypeScript 7.0.2 failed in Next's TypeScript config loader: that version exports no `ts.sys` compiler API. It passed with TypeScript 5.9.3. Automatic provisioning of missing tooling for Next 15 hosts needs a compatible version policy; it must preserve an existing host toolchain.

A fresh scaffold installation also exposed Tiptap optional menu peers selecting 3.32.0 beside pinned core/pm 3.31.3, producing npm peer warnings. The production editor probe passed, but the dependency graph is not marked clean; explicit coherent menu dependencies are a separate packaging follow-up. Existing lockfile tests alone do not cover this fresh-install case.

Actual supported-runtime/OS/HTTPS acceptance remains in the release checklist. No merge, tag, release, deployment or production migration was performed.
