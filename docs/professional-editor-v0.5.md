# Professional Content Editor — v0.5.0

## Goal

Replace the current block-first authoring experience with a writer-first editor while preserving DigitalAfarin CMS's structured block JSON architecture.

The default editing experience should feel closer to WordPress/Notion than to a developer-oriented block debugger.

## Non-negotiable compatibility

- Django/DRF remains the source of truth for content, workflow, revisions, SEO and permissions.
- `ContentEntry.blocks` remains the canonical content body.
- Do not introduce a single rendered HTML blob as the canonical source.
- Existing content using `paragraph`, `heading`, `image`, `quote`, `list`, `code`, `cta`, `faq` and `divider` blocks must remain readable/editable.
- Resolver contracts and existing public consumers must remain backward compatible.
- Advanced/custom blocks must not be destroyed when using the standard editor.

## UX model

The content form has two authoring modes:

1. **Standard Editor** — default
   - Tiptap-based rich text experience.
   - One continuous writing canvas.
   - Toolbar + bubble menu.
   - RTL-first.
   - Keyboard shortcuts.
   - Word count and estimated reading time.
   - Fullscreen/focus mode.
   - Clean paste from Word/Google Docs.
   - Link controls and media insertion.
   - Undo/redo.
   - Tables.
   - Lists, quote, code block, headings and horizontal rule.
   - Slash commands can be added after the first stable implementation.

2. **Advanced Blocks**
   - Existing BlockEditor remains available.
   - Used for CTA, FAQ, reusable/custom blocks, debugging and migrations.
   - JSON mode remains available only here.

The user can switch modes without silently losing content.

## Data strategy

### Canonical storage

Keep `blocks: ContentBlock[]` as the source of truth.

For prose authored in Tiptap, use a structured `rich_text` block:

```json
{
  "id": "rich_text-...",
  "type": "rich_text",
  "data": {
    "doc": {
      "type": "doc",
      "content": []
    },
    "text": "Plain-text fallback derived from the document",
    "html": "<p>Derived rendering cache for simple consumers</p>",
    "format": "tiptap-json",
    "version": 1
  }
}
```

Rules:

- `data.doc` is the source for the rich-text block.
- `data.html` is derived, never authoritative.
- `data.text` is a derived plain-text fallback for SEO, previews and backward-compatible consumers.
- Advanced blocks stay as separate blocks.
- Do not flatten custom/unknown blocks into rich text.

### Existing content migration in the UI

When Standard Editor opens:

- Consecutive legacy prose blocks that can be safely represented in Tiptap may be imported:
  - paragraph
  - heading
  - quote
  - list
  - code
  - divider
- image blocks may be represented as Tiptap image nodes only when their metadata can round-trip without loss.
- CTA, FAQ and unknown/custom blocks remain Advanced Blocks.
- If conversion would be lossy, show a clear notice and preserve the original blocks.

No automatic database migration is required for v0.5.0.

## Initial Tiptap feature set

Required for v0.5.0:

- StarterKit
- Link
- Underline
- Highlight
- Text alignment
- Placeholder
- Table
- Table row/header/cell
- Image support integrated with Media Library
- RTL/LTR text direction controls
- Bubble toolbar
- Word count / reading time
- Focus/fullscreen mode
- Undo/redo
- Clean keyboard-driven editing

Follow-up candidates:

- Slash commands
- Mention/autocomplete
- reusable block insertion
- AI assistant
- collaborative editing
- comments
- advanced table controls

## Authoring layout

Preferred content edit hierarchy:

```text
Title
Slug / Path
Excerpt

-----------------------------------
Professional Editor
[toolbar]
[large writing canvas]
-----------------------------------

Advanced Blocks (collapsed by default)

Publishing / Workflow
Featured image / Taxonomy
SEO
Schema
Internal Links
Revisions
```

The editor should occupy most of the horizontal space and should not feel like a small form field.

## Component plan

New components:

- `ProfessionalEditor.tsx`
  - owns Standard / Advanced mode
  - converts between Tiptap rich-text state and CMS blocks
  - preserves non-rich blocks
- `RichTextEditor.tsx`
  - Tiptap integration
  - toolbar / bubble menu / focus mode
- `EditorToolbar.tsx`
- `EditorBubbleMenu.tsx`
- `editor-block-adapter.ts`
  - conversion utilities
  - legacy block import
  - derived html/text generation

Existing:

- `BlockEditor.tsx` remains the Advanced editor.
- `MediaPicker.tsx` is reused.
- content create/edit pages use `ProfessionalEditor` instead of calling `BlockEditor` directly.

## Safety / behavior rules

- Never drop unknown blocks.
- Never overwrite advanced blocks merely because Standard Editor cannot render them.
- Switching modes must be explicit and deterministic.
- New content starts in Standard Editor.
- Existing entries containing custom/unsupported blocks should show a compatibility notice.
- Revisions continue to snapshot normal `blocks` payloads; no revision schema fork.
- Preview and publish flows stay unchanged.

## Validation targets

Before merge:

- `npm run typecheck`
- `npm run build:admin`
- package smoke tests
- create new content with Standard Editor
- edit legacy paragraph/heading/list content
- switch Standard -> Advanced -> Standard without data loss
- preserve CTA/FAQ/custom blocks
- Media Library image insertion
- SEO/revision/preview flows still operate
- scaffolded Admin build passes

## Release scope

Target release: **v0.5.0**

This is a user-facing editor milestone, not a backend content-model rewrite.
