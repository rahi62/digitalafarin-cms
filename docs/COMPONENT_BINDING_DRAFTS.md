# Versioned Component Binding Drafts — CMS Authoring

Draft PR #62 depends on visual registry PR #61 and the earlier #57–#60 chain. Do **not** merge or deploy.

## Why

The GUI in PR #61 generates host-owned TypeScript without persistence. PR #62 provides authenticated, tenant-scoped **draft persistence and revision history**. It does **not** make the CMS database a source of executable Next.js components or activate any host route.

## API

All endpoints use Django authentication and the regular organization membership permissions.

- `GET /api/cms/v1/content/component-bindings/?site=<site-uuid>` — list drafts visible within the organization; optional `host_key` filter.
- `POST /api/cms/v1/content/component-bindings/` — create a draft from `{site,host_key,slots}`, starting at version 1. Unique key is `site + host_key`.
- `GET /api/cms/v1/content/component-bindings/{id}/` — retrieve one draft.
- `PATCH /api/cms/v1/content/component-bindings/{id}/` — update `slots` with `expected_version`. A stale version returns HTTP **409** and does not overwrite concurrent changes.
- `GET /api/cms/v1/content/component-bindings/{id}/history/` — list up to 30 recent version checkpoints, with timestamps and authors.
- **DELETE intentionally unsupported.** Avoid permanent loss while backup/restore and central trash policies remain under development.

Owner, Admin and Editor may write; other organization roles can read but cannot modify. Unauthorized cross-tenant references are not exposed.

Stored payload format:

```json
{
  "site": "<site UUID>",
  "host_key": "main",
  "slots": [
    {
      "id": "HomeHero",
      "route": "/",
      "component": "HeroSection",
      "props": {
        "heading": "content.custom_fields.hero.title",
        "brand": "site.name"
      },
      "required": ["heading"]
    }
  ]
}
```

The backend validates bounded payloads, canonical static local paths, source roots, permitted property keys, duplicate slot IDs, required props and prototype-traversal traps. The backend **cannot certify that the host route exists** because the route report belongs to the independently deployed Next.js host. The GUI does a preliminary cross-check against the authenticated route snapshot.

## Database and release

Migration `0007_component_binding_drafts` creates two new tables (`ComponentBindingDraft` and `ComponentBindingRevision`) without changing existing published entries, pages or SEO. Version records keep full manifest payloads and the user responsible for each edit.

**Host deployment remains explicit.** Export generated TypeScript, review source/route mappings and commit it inside Next.js. Changes saved here do not automatically alter runtime configuration or revalidate deployed host builds.

## Remaining

- Host manifest handshake with deployment fingerprint/version detection
- Safe promotion and atomic rollback of active host configurations
- Revision diff and a supported restore UI
- Real-time cross-editor conflict reconciliation
- Dynamic routes, repeater indexing and binding to actual component prop types
- Operational backup/restore and end-user staging acceptance

CI and regression tests in PR #62 cover storage, permissions, version conflicts, field validation and Admin save/load behavior. Actual host acceptance remains a separate gate after product feature completion.
