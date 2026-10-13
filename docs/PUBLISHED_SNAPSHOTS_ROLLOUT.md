# DigitalAfarin CMS — Published Snapshot rollout
**Work in progress:** `feat/cms-published-snapshot-core` (dependent on PR #54). Not deployed or merged.

## Intended contract

- `ContentEntry` is the mutable editorial working copy. Admin API, draft preview and autosave continue to use it.
- `PublishedEntry` is a separate one-to-one database projection with frozen body, title/path, SEO, schemas, taxonomy labels, published timestamp and indexability.
- Only explicit `publish` (including the existing scheduled-publication worker) updates the public projection and creates a redirect for an approved live URL move.
- Public `content/resolve/`, `content/public-entries/` and `content/sitemap/` return data based on the published projection. The HTTP response shapes remain compatible with current Next.js SDK use.
- `return-draft` explicitly unpublishes by deleting the projection, but preserves `ContentEntry` and revisions. Browser UI requires confirmation for this disruptive action.
- Live entry site and content type cannot be reassigned while a published projection exists.

## Migration and data protection

- Additive `0003_published_entry` migration introduces a new table with a site+path uniqueness constraint.
- The data migration takes an immutable snapshot of currently published content, SEO, schema and associated taxonomies. It does **not** delete or rewrite current editorial records.
- Before applying on a real installation, take verified Postgres/media backups, confirm Django migration graph, and run a restore rehearsal in staging.
- Deploy migration **with** the API code in a coordinated release. Deploying old API code against an upgraded database is generally possible, but it will not keep new projections synchronized if old publication handlers run.
- Audit any custom host services that bypass `entry.publish()` or write `ContentEntry.status` directly; use the supported publication workflow.
- Existing publication URLs and SEO metadata are captured at migration time. First explicit republish updates the stored projection.
- Do not roll back a release without first planning how content published since the migration will be preserved. Migration reversal destroys the new published table.

## Compatibility changes

- Previously, saving a `published` entry could change public body/URL immediately and create a redirect. Now it only saves working-copy fields. The public URL and its redirect update **on the next explicit publish**.
- SEO and schema edits do not update live markup until republish.
- Category/tag changes do not update public collection filters until republish.
- Draft preview shows the current editor record, not the published snapshot.
- This change is deliberate and should appear in release notes and the editorial UI.

## Remaining issues before this feature can merge

- CI for Python 3.11/3.12/3.13 and Next host E2E must be green.
- Review large-scale taxonomy filter performance and publication concurrency in PostgreSQL; the cross-DB fallback scans snapshot taxonomy arrays.
- Expand migration tests with a pre-migration fixture and verify rollback/upgrade on real staging copies.
- Improve immutable version history of past publications, rollback UX, and concurrent editor conflict detection in follow-up work.
- Full ACL, safe delete/restore, jobs, installer and broader UX modernization remain on the product roadmap.

**Never merge or publish this PR automatically.**
