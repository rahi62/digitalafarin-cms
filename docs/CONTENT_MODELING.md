# DigitalAfarin CMS — Advanced Content Modeling (Draft)

Target branch: `feat/cms-content-modeling-fields` → depends on published snapshot PR #55 (which in turn depends on PR #54).

## JSON schema compatibility

Existing records keep `ContentEntry.custom_fields` as a JSON object, preserving the SDK and public published snapshot contract. New primitive and nested types do not require a database migration.

Supported new field types:

| Type | Schema configuration | Stored value |
| --- | --- | --- |
| `group` | `fields: [...] ` | nested object |
| `repeater` | `fields: [...], min_items, max_items` | array of nested objects |
| `gallery` | `min_items, max_items` | array of media URL strings |
| `relation` | `target_content_type: "slug"` | string UUID referencing an entry belonging to the same site and target type |

For example:

```json
{
  "fields": [
    {"key": "destination", "type": "relation", "target_content_type": "destination"},
    {"key": "highlights", "type": "group", "fields": [
      {"key": "title", "type": "text", "required": true},
      {"key": "featured", "type": "boolean"}
    ]},
    {"key": "itinerary", "type": "repeater", "min_items": 1, "max_items": 20,
      "fields": [
        {"key": "day_title", "type": "text", "required": true},
        {"key": "description", "type": "textarea"}
      ]
    },
    {"key": "gallery", "type": "gallery", "max_items": 15}
  ]
}
```

## Safety and limitations

- Validation is recursive with maximum depth 3, max 50 fields per level and max 50 repeater/gallery items; basic primitive validation is performed at every level.
- Relationships are **single-record**, stored as a UUID. They are checked against the current site, type and a real entry. They are not automatically expanded on public reads; host renderers should resolve them explicitly with scoped API access.
- Related content type slug must exist in the same site when editing a type; self-links are permitted.
- Historical/unknown JSON keys are retained rather than automatically discarded.
- When an existing type already has entries, breaking schema changes (removing field, changing its type, changing relation target, making fields required, narrowing repeater limits, removing select choices) are blocked until a deliberate data migration is implemented.
- The `POST /content/types/{id}/schema-impact/` endpoint is a **read-only dry run** with an affected entry count and a bounded example list. It requires authorized write access to that tenant's content type.
- In the Admin, `AdvancedFieldDesigner` configures nested fields and `AdvancedField` renders the values. The gallery picker copies media URLs and does not transfer or delete media.
- Field-value relation references currently have no cascade policy when a referenced entry is deleted; implement proper reference tracking and safe deletion before shipping.
- Existing media normalization still applies to public output. Draft API serialization may normalize local media URLs according to deployment configuration.

## Next tasks

- Build an explicit, dry-run-first schema migration workflow for existing data and history.
- Protect referenced entry deletion and content-type target renames, and add relationship usage listing.
- Large-schema UI accessibility, pagination and load performance (including relation picker pagination).
- Add structured `singleton` vs `collection` semantics and host component-binding registry.
- Final host acceptance after all feature-completion milestones.

**Status:** GitHub CI is regression protection only. No production migration, release or merge.
