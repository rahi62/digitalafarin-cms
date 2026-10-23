# Shared login abuse limits

The shipped `/auth/token/` API uses database-backed budgets before credential validation, without Redis or process-local counters.

| Budget | Admitted attempts | Window |
| --- | --- | --- |
| Backend-visible address | 120 | 60 seconds |
| Normalized account, across addresses | 20 | 60 seconds |
| Address/account pair | 5 | 60 seconds |

All admitted attempts count, including successes. Successful authentication does not reset shared budgets. Blocked requests return 429 with bounded integer `Retry-After`; they do not extend the window or create a permanent account lock. Existing and unknown accounts follow the same policy. Account normalization affects only the limiter, not host authentication semantics.

```python
DIGITALAFARIN_CMS_LOGIN_LIMITS = {
    'window': 60, 'ip': 120, 'account': 20, 'pair': 5,
}
```

Unknown keys, booleans, non-integers, zero and values above 3600 trigger system check E004. Limits cannot be silently disabled with invalid values.

## Transactions and concurrency

Three HMAC-keyed counters are locked in a consistent order in one transaction. PostgreSQL tests prove four concurrent connections cannot exceed one remaining attempt. The table stores no raw usernames, addresses or passwords. Instances must share the Django secret and primary database.

The shipped token-obtain callback uses `transaction.non_atomic_requests`, preventing host `ATOMIC_REQUESTS=True` from rolling counters back after invalid credentials. A real TransactionTestCase reproduces this bypass without the exemption. Hosts mounting `CmsObtainPairView` independently must preserve the callback exemption. The limiter retains its own explicit transaction.

SQLite supports development; concurrent multi-instance guarantees require real row locks, verified on PostgreSQL. Custom database routers and replicas require separate verification.

## Address trust and Admin

Only `REMOTE_ADDR` is used. Caller-controlled `Forwarded`/`X-Forwarded-For` headers cannot reset budgets. Behind Next.js BFF or a reverse proxy, users share the backend-visible proxy address budget. Tune this aggregate budget for actual traffic; do not blindly trust forwarded headers. Per-account budgets still apply across addresses.

The BFF preserves 429 and validated `Retry-After` (1–3600 seconds), displays Persian retry advice, and creates no session cookies for a denied login. Legacy Admin also shows retry advice. Browser tests cover the rendered error and header propagation; Django tests exercise credential validation and shared counters.

## Migration and cleanup

Additive sites migration `0003_cms_login_rate_buckets` creates a counter table and expiry index. It does not change existing accounts, content or published snapshots. Operational rollout requires a staging migration rehearsal and explicit authorization.

Preview expired-bucket cleanup:

```sh
python manage.py cms_prune_login_limits --limit 1000
```

Explicit bounded cleanup, when operationally scheduled:

```sh
python manage.py cms_prune_login_limits --limit 1000 --execute
```

The default is a dry run. Execution rechecks expiry and preserves active/renewed budgets. No user accounts, content or security history are deleted.

## Remaining work

This bounded fixed-window policy does not provide adaptive bot detection, MFA, token-family compromise detection or a complete persistent security audit. Distributed attackers can consume an account budget and temporarily deny login for the remaining window. Audit storage/Admin review, CSP and broader lifetime/recovery policies remain unfinished.
