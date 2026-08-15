# Release-candidate validation

Validation performed for DigitalAfarin CMS Community Edition `0.2.0` before packaging.

## Passed in the packaging environment

- Python source and tests compile with `python -m compileall`.
- Python wheel builds successfully with PEP 517/setuptools metadata.
- Python source distribution builds successfully.
- Wheel metadata reports `digitalafarin-cms==0.2.0`, `Apache-2.0`, and Python `>=3.11`.
- Wheel/sdist include namespaced Django migrations and tenant-security code.
- Migration references were checked for stale un-namespaced app labels.
- Package versions are synchronized across Python, npm SDK, npm CLI, and monorepo metadata.
- `@digitalafarin/cms-next` packs successfully.
- The packed SDK imports in Node ESM and its client helpers execute successfully.
- `@digitalafarin/cms-cli` packs successfully and its executable bit is preserved.
- CLI `doctor` executes from the packed tarball.
- CLI wiring was previously smoke-tested twice against a synthetic Django + Next.js repository to verify idempotent settings/URL patching.
- GitHub Actions YAML is present for CI and OIDC/Trusted-Publishing releases.
- Tenant-scoping, role-aware write controls, and same-site serializer invariants are covered by package tests that CI will execute.

## Environment limitation

This container cannot resolve external PyPI/npm registry dependencies, so a fresh dependency install followed by the full Django `migrate`/pytest and Next.js typecheck cannot be executed locally here. The repository CI intentionally performs those dependency-backed checks on GitHub-hosted runners before a release is published.

Before tagging the first public release, require the `CI` workflow to pass on GitHub.
