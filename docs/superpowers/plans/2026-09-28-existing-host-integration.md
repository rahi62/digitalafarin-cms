# Existing Django + Next.js integration repair

**Goal:** Publishing once produces a public collection item, canonical detail path, signed preview and usable media on an existing host.
**Spec:** The user's attached integration requirements, reflected below.
**Architecture:** Django owns routing, visibility and preview authorization. The SDK exposes typed public reads with no-store defaults. CLI scaffolds reviewable adapters and a dedicated preview rewrite without overwriting host routes. Existing entries retain manual paths until explicitly opted into generated routing.
**Execution:** Inline implementation in the supplied workspace; leave changes reviewable without committing or publishing.

## Contract and constraints

- Content types gain optional `collection_path` and `entry_path_pattern`; entries gain `path_mode` (manual by default for existing rows, automatic for new entries with a configured pattern).
- Normalize Unicode paths and slash variants, reject reserved paths and collisions, reserve collection paths for list pages. Moving published content creates a redirect atomically; no bulk URL rewrite.
- Public collection API filters by active site, public type and published status. Search/category/page/page_size are supported with stable ordering and bounded pagination. Details continue to use resolver.
- CMS-first detail fallback only on public 404. Preview errors never fall back. Collections use CMS as the single paginated source; legacy collections remain independently addressable until explicitly migrated.
- Media URLs use configured public media base, retain external storage URLs, and normalize legacy media references at serialization. Same-origin media uses a fixed upstream proxy; no client-selected host and no redirect following.
- Preview tokens bind site, entry and path, expire, and responses carry no-store/noindex/no-referrer. An early rewrite routes preview requests for existing host pages to a dedicated renderer.
- Wagtail redirect exclusion is narrowly scoped to CMS API and media; diagnostic checks report unapplied Wagtail migrations independently.
- All four package versions and workspace lockfile move together to 0.7.0. Consumer installation is not changed or published.

## Tasks

- [ ] Backend routing: models/migration, path validation service, serializer, redirects and routing preview endpoint. Tests cover Unicode, encoded paths, reserved paths, manual compatibility, collisions and slug changes.
- [ ] Public API/preview: typed-safe serialization, list filtering/pagination, resolver normalization and token/path binding. Tests cover tenant/private/draft exclusion, publish/edit/unpublish and expired/wrong-path tokens.
- [ ] Media/host: public URL normalization, fixed upstream forwarding contract, Wagtail exclusion and Django checks/doctor. Tests cover nested images, production localhost rejection, 404 preservation and no redirect following.
- [ ] SDK/CLI: typed public list/detail helpers, sanitized errors, cache semantics, route inventory and reviewable host adapters, dedicated preview route and media handler. Tests exercise installation into existing home/blog/detail routes without overwrites.
- [ ] Admin: content type routing controls and backend-confirmed path preview before save/publish, normalized media consumption.
- [ ] Delivery: end-to-end fixture, upgrade guide/environment settings, version alignment and all relevant regression/build/migration checks.

## Review focus

Encoded slashes and double encoding; host middleware/config composition; reused old redirect URLs; preview on root and existing dynamic routes; stored absolute localhost media references.

## Progress / decisions

- Initial inspection confirms missing routing contract/public collection endpoint, preview-unaware CLI route, and upstream HTML error exposure.
- The user explicitly requests implementation through delivery. Routine design and execution choices proceed under that authorization.
