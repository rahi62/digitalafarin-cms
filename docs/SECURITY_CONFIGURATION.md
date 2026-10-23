# CMS session security configuration checks

Run `python -m django check` during host installation and CI. These checks report incompatible host settings; they never rewrite the host configuration.

| Code | Severity | Meaning |
| --- | --- | --- |
| digitalafarin_cms.E002 | Error | The first DRF authenticator must be CmsSessionJWTAuthentication or a subclass. Later host authenticators remain permitted. |
| digitalafarin_cms.E003 | Error | Managed refresh replay protection requires rotation, blacklist-after-rotation and the SimpleJWT blacklist app. |
| digitalafarin_cms.W002 | Deployment warning | Compatibility mode accepts legacy/non-managed authentication. Enable strict mode after coordinating client rollout. |
| digitalafarin_cms.W003 | Deployment warning | The default database does not implement SELECT FOR UPDATE; multi-instance refresh safety requires real row locks. |

`apply_defaults()` already supplies the required rotation and blacklist settings. If the host overrides them, keep both booleans enabled:

```python
SIMPLE_JWT = {
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}
```

Preserve other host SimpleJWT settings when editing this dictionary. Install `rest_framework_simplejwt.token_blacklist` and rehearse its migrations against a restored staging backup before operational rollout. Do not run production migrations as part of diagnosis.

Use `python -m django check --deploy` to include W002/W003 and Django's own deployment checks. For a coordinated production setup:

```python
DIGITALAFARIN_CMS_REQUIRE_MANAGED_SESSIONS = True
```

This setting rejects legacy JWTs and host authentication without a managed CMS session at protected CMS endpoints. It can require existing users to sign in again. Keep compatibility mode during an explicitly planned transition rather than treating it as complete revocation coverage.

The verified multi-instance configuration uses one PostgreSQL primary for all session reads, writes, transactions and blacklist operations. W003 examines only the default database. Custom database routers, replicas, cross-database session placement and stale session-query caches are outside this tested contract and require independent verification. Database row locking does not coordinate browser cookie refresh races across tabs.

These checks do not complete production security: login abuse protection, CSP, unified security audit, recovery and full session lifetime policy still need implementation and acceptance.
