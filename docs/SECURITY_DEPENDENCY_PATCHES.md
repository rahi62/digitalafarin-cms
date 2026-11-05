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

The Next 15 probe with TypeScript 7.0.2 failed in Next's TypeScript config loader because that version exports no JavaScript compiler API. Missing embedded-host TypeScript is now provisioned as `^5.9.3`; declared host compilers/types are preserved. Other missing type packages use the Admin metadata ranges rather than unbounded latest versions. Next 16 standalone defaults remain unchanged.

A fresh Next 15 host also generated legacy `moduleResolution: node`, which could not resolve exported subpaths from the SDK and Tiptap. Embed initializes `tsconfig.json` with the modern `bundler` resolver only if the file is absent. It extends an existing `jsconfig.json` to retain aliases and never rewrites existing TypeScript JSONC, host layouts, routes or middleware. Existing hosts with a legacy resolver must explicitly review their own TypeScript configuration; CMS does not silently replace it. The direct embed command checks for an occupied CMS route before installing tooling. The outer installer may install package dependencies before invoking embed, so this is not a claim that every CLI command is side-effect-free on an occupied route.

CI now exercises packed embedded hosts on both default Next 16 and exact Next 15.5.28, without predeclared tooling; the latter retains the explicit fixture-only PostCSS override. Builds and dependency audits are required, not merely mocked install success. Seven targeted tooling regressions cover missing/preserved dependencies, occupied-route refusal, skip-install feedback, missing config, JSONC preservation and inherited jsconfig.

The fresh-install Tiptap menu gap is resolved by the explicit menu dependencies: Admin now explicitly depends on bubble-menu and floating-menu 3.31.3 alongside core/pm 3.31.3. Before the fix, a fresh standalone installation selected menus 3.32.0 and `npm ls` failed with `ELSPROBLEMS` for incompatible core/pm peers. After the fix, fresh standalone and embedded tarball installations pass the same dependency check without ERESOLVE warnings. The package smoke script now checks both graphs, so the repository lockfile cannot hide this regression. The embedded consumer production build, seven editor browser tests, 29 SDK/CLI tests, ten Admin tests and typecheck pass; repository audit reports zero vulnerabilities. The smoke fixture still emits Next's multiple-lockfile workspace-root warning because its consumer projects are nested.

Actual supported-runtime/OS/HTTPS acceptance remains in the release checklist. No merge, tag, release, deployment or production migration was performed.
