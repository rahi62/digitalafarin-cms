# DigitalAfarin CMS — Controlled Field Renaming (P0 incremental)

Draft PR #59 depends on draft PR #58 and #57. No merge/release/deployment.

## Scope
This is deliberately a **single-operation, bounded schema migration**, not a complete schema migration engine.

- `POST /content/types/{id}/schema-rename/` with `mode=preview`, `source_key`, `destination_key` runs read-only impact analysis.
- Preview checks root field existence, target collisions in all editorial records (including Trash), current field validation, maximum 200 records, and presence of published snapshots.
- Successful previews issue a signed, 15-minute token covering content type/schema, operation and a digest of every editable record's current `custom_fields`.
- `mode=execute` requires `confirm=true` and the exact current preview token, restricted to tenant Owner/Admin.
- Under a site row lock and atomic transaction, execution revalidates current records, renames the root schema key, migrates the matching `custom_fields` key on working copies, records `ContentRevision` checkpoints, and writes a `ContentSchemaMigration` audit containing before/after schemas.
- If any record changed, data is invalid, target contains values, or token is expired, operation is rejected with no partial changes.
- **Published snapshots are never modified** by this operation. Content types with any live snapshot cannot run it; they need a separately coordinated versioned migration.

## Limits
- Supports only a root-level field key rename. Does not migrate nested groups, repeaters, field type conversions, option removal or relationships.
- No automatic rollback endpoint. Previous schema, old values in revisions and audit provide recovery artifacts; manual restore must be planned and tested before production use.
- Large sets over 200 entries require an offline, versioned, transactional migration with a backup/restore rehearsal.
- Host Next.js components reading the renamed key must be updated in a coordinated code release.
- Migration `0006_content_schema_migration_audit` is additive; older content unchanged until explicit action.
- This does not replace a complete staged schema compatibility layer with deployed content snapshots.

The Admin offers a preview-and-confirm wizard inside Content Type Builder. No raw SQL, direct table manipulation or automatic data deletion is involved.

**No production migration, merge, npm/pip publication or server deploy was performed.**
