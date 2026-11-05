# Recoverable Content Trash — DigitalAfarin CMS

Implementation branch `feat/cms-trash-restore-workflow`; draft PR #58 depends on PR #57. Not merged or deployed.

## API contract

- `DELETE /api/cms/v1/content/entries/{id}/` performs **soft deletion** (HTTP 204); `POST .../{id}/trash/` provides an explicit alternative.
- `GET /api/cms/v1/content/entries/trashed/` lists only trashed entries, tenant-scoped, paginated and filterable by `site`.
- `POST /api/cms/v1/content/entries/{id}/restore/` restores a trashed record as **draft** only, never automatically republishing.
- Trashed records are hidden from normal Admin GET/list/search, workflow actions, relationship selection, public lists and resolver.
- All edits on a trashed record must first restore it; direct writes to `deleted_at`/`deleted_by` through the serializer are rejected/ignored as read-only.

## Protection and SEO

- Published and scheduled content requires publisher role to be trashed. Drafts follow existing tenant write ACL.
- Published projection is removed when trashed. SEO/Schema/editorial data and revision history remain with the content record.
- Incoming relations (including Group/Repeater and published frozen snapshots) block trash to avoid dangling references.
- The URL remains **reserved while in Trash**, including the unique singleton slot; this is deliberate for recovery and canonical safety.
- Site locks and atomic transactions protect state/projection updates. Restore checks route conflicts; it does not create redirects.
- No permanent-delete API or automatic retention/purge policy in this phase.

## Migration

- Additive `0005_contententry_trash` adds indexed `deleted_at` and nullable `deleted_by` to `ContentEntry`. All existing entries default to active; no data is rewritten or deleted.
- Operational rollout requires a verified Postgres/media backup and restoring a staging copy before migration.
- Apply migration in the same coordinated release as the new API; an older application unaware of Trash state could operate on trashed entries.
- This phase does **not** override direct ORM `.delete()` or all external integrations. Centralized destructive-operation governance and audit logs remain future tasks.

## Product behavior

Admin Content list gains a guarded Trash action. The Trash screen supports per-site browsing and Restore. Restored records reappear in the normal content list as Draft. Users must republish through the ordinary editorial workflow.

## Next phases

Safe schema migration plans and rollback, materialized relation indexing for large datasets, Next.js component registry, auth/session hardening, and full host acceptance after completion.

**No merge, package release or production migration without explicit approval.**
