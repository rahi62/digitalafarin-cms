# Controlled Component Registry Approval & Rollback

**Branch:** `feat/cms-component-approval-rollback`, Draft PR #63, dependent on #62 (and #61 through #57). Do not merge, publish or deploy.

## Semantics: approval is NOT remote code execution

DigitalAfarin CMS stores editable binding drafts (`ComponentBindingDraft`) and immutable checkpoints (`ComponentBindingRevision`). The new approval pointer selects one checkpoint for **reviewed host deployment**; the host continues using whatever components and configuration its own build deploys. CMS cannot change source files, execute remote JavaScript, take ownership of host routes or attest live runtime automatically.

- `approved_version` is nullable until the first approval.
- Editing the draft creates a new version but **does not** change the approved version.
- `ComponentBindingApprovalEvent` records every promotion or rollback with actor, previous/next versions, checksum and optional reason.
- Rollback may target **only a previously approved version**. It changes the approval pointer, **not** the editable draft, and does not revert a Next.js deployment.
- `runtime_status` is intentionally `unverified` until a separate opt-in host handshake/deployment mechanism is established.

## API (authenticated; tenant-scoped)

For `/api/cms/v1/content/component-bindings/{id}/`:

| Endpoint | Roles | Purpose |
| --- | --- | --- |
| `GET approval/` | Site members | Current draft/approved versions and up to 30 audit events |
| `GET approved-manifest/` | Site members | Export approved immutable slots, version and SHA-256 digest |
| `POST approve/` | Owner/Admin | Approve only **current saved draft revision** |
| `POST rollback-approval/` | Owner/Admin | Move pointer to a **previously approved** revision |

POST operations require:
```json
{
  "confirm": true,
  "target_version": 2,
  "expected_draft_version": 2,
  "expected_approved_version": 1,
  "reason": "Ready for host validation"
}
```

Use `expected_approved_version: null` before first approval. If either observed version changed, the operation returns **409**, preserving concurrent changes. Rollbacks must include a nonempty reason. The target is validated under a database row lock and an atomic transaction; changes to pointer/event are all-or-nothing.

The Admin shows the saved draft version versus approved version, requires an explicit confirmation, disables approval when form edits are unsaved and allows selecting prior-approved versions for rollback.

## Opt-in host build verification

The Next.js SDK exports `assertCmsApprovedHostManifest(remote, localRegistry, pinned)`. A trusted server-side host fetch can compare the API-approved manifest against the site's *locally compiled* registry and a pinned identity:

```ts
import {
  assertCmsApprovedHostManifest,
  defineCmsComponentRegistry,
} from "@digitalafarin/cms-next";

// This registry must be reviewed and checked into the host project.
const registry = defineCmsComponentRegistry([{ 
  id: "HomeHero", route: "/", component: "HeroSection",
  props: { heading: "content.title" }, required: ["heading"],
}]);

// Fetch 'remote' via authenticated server-to-server HTTPS API.
// Pin expected values in a reviewed host build/deployment configuration.
assertCmsApprovedHostManifest(remote, registry, {
  site: "YOUR_SITE_UUID",
  hostKey: "main",
  version: 2,
  checksum: "THE_64_CHARACTER_SHA256_DIGEST_FROM_APPROVED_MANIFEST",
});
```

Mismatch is fail-closed; it does not overwrite the local registry or fall back to executing server-provided code. **Checksum equality is not a replacement for authenticated transport or code signing**. No remote HTTP request is performed by this helper.

## Migration and safety

- Additive `0008_component_binding_approvals` adds nullable approval pointers and a new append-only event table; prior drafts remain unapproved and unchanged.
- Run verified database/media backup and staging migration rehearsal before an operational rollout.
- Never expose management credentials or authenticated manifest endpoints to browsers without appropriate access controls.
- Next step: host deployment reporting/attestation against the approved version, a rollback-aware release handshake, and production-grade admin authentication/session hardening.

**Neither this feature PR nor any dependency was merged; no live database migrated, package published or server deployed.**
