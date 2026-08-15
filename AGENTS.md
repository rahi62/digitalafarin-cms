# AGENTS.md — DigitalAfarin SEO CMS

## Mission
Build a reusable multi-site Headless CMS + SEO platform for Next.js products. Do not couple content storage to one frontend theme or one client project.

## Non-negotiable architecture
- Django REST Framework owns content, SEO, taxonomy, permissions, revisions and integrations.
- Next.js admin is a separate client.
- Public Next.js applications consume the resolver API or `@digitalafarin/cms-next`.
- Content body is structured block JSON, never a single rendered HTML blob.
- Every tenant-aware feature must ultimately scope through Organization -> Site.
- SEO data is URL/content-entry level and can evolve independently from block content.

## Current V1 modules
- apps.sites: Organization, Site, Membership
- apps.content: dynamic content type, entries, revisions, taxonomy, menus, reusable blocks
- apps.seo: metadata, schema, keywords, clusters, mappings, redirects, internal link suggestions
- apps.media_library: uploaded assets
- apps.audit: asynchronous audit runs/issues
- apps.integrations: site webhook registry
- packages/cms-next: public Next.js SDK
- apps/admin: operational admin UI

## Next implementation priorities
1. Object-level tenant permissions and queryset scoping for all API endpoints.
2. Visual block editor with drag/drop and schema-driven block forms.
3. Webhook dispatcher on publish/update and secure Next.js revalidation endpoint example.
4. Full crawler: status codes, canonicals, titles, headings, internal graph, images, redirect chains.
5. Internal-link recommendation engine using keyword mappings + embeddings optional.
6. Google Search Console OAuth and daily ingestion tables.
7. Content decay alerts and opportunity reports.
8. AI assistant with explicit tools; never give the model unrestricted SQL access.
9. Billing/limits/white-label only after core CMS/SEO workflows are stable.

## Development rules
- Add migrations for every model change before merging.
- Add API tests for resolver and tenant isolation.
- Keep resolver backward compatible or version it.
- Never make public pages depend on the admin app.
- Prefer typed contracts in the SDK over frontend-specific duplication.
- Avoid storing generated page HTML as the source of truth.
