"use client";

import type { ContentBlock } from "@/components/BlockEditor";

export type RichTextDoc = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextDoc[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

export type RichTextValue = {
  doc: RichTextDoc;
  html: string;
  text: string;
};

export type BlockAnalysis = {
  standardAvailable: boolean;
  value: RichTextValue;
  existingId?: string;
  migratesLegacy: boolean;
  preservedBlocks: ContentBlock[];
  reason?: string;
};

const LEGACY_TYPES = new Set(["paragraph", "heading", "quote", "list", "code", "divider"]);

export function emptyDoc(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function textNode(value: unknown): RichTextDoc[] | undefined {
  const text = typeof value === "string" ? value : "";
  return text ? [{ type: "text", text }] : undefined;
}

function paragraph(value: unknown): RichTextDoc {
  return { type: "paragraph", content: textNode(value) };
}

function safeHeadingLevel(value: unknown) {
  const level = typeof value === "number" ? value : Number(value || 2);
  return Math.min(6, Math.max(1, Number.isFinite(level) ? level : 2));
}

function isSafeLegacyBlock(block: ContentBlock) {
  if (!LEGACY_TYPES.has(block.type)) return false;
  if (block.type === "quote" && block.data?.cite) return false;

  if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
    const value = block.data?.text;
    return value == null || typeof value === "string";
  }

  if (block.type === "list") {
    return !block.data?.items || (Array.isArray(block.data.items) && block.data.items.every((item) => typeof item === "string"));
  }

  if (block.type === "code") {
    return (block.data?.code == null || typeof block.data.code === "string")
      && (block.data?.language == null || typeof block.data.language === "string");
  }

  return true;
}

export function legacyBlocksToDoc(blocks: ContentBlock[]): RichTextDoc {
  const content: RichTextDoc[] = [];

  for (const block of blocks) {
    if (block.type === "paragraph") {
      content.push(paragraph(block.data?.text));
      continue;
    }

    if (block.type === "heading") {
      content.push({
        type: "heading",
        attrs: { level: safeHeadingLevel(block.data?.level) },
        content: textNode(block.data?.text),
      });
      continue;
    }

    if (block.type === "quote") {
      content.push({
        type: "blockquote",
        content: [paragraph(block.data?.text)],
      });
      continue;
    }

    if (block.type === "list") {
      const items = Array.isArray(block.data?.items) ? block.data.items.map(String) : [];
      content.push({
        type: block.data?.ordered === true ? "orderedList" : "bulletList",
        content: items.map((item) => ({
          type: "listItem",
          content: [paragraph(item)],
        })),
      });
      continue;
    }

    if (block.type === "code") {
      content.push({
        type: "codeBlock",
        attrs: { language: typeof block.data?.language === "string" ? block.data.language : null },
        content: textNode(block.data?.code),
      });
      continue;
    }

    if (block.type === "divider") {
      content.push({ type: "horizontalRule" });
    }
  }

  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function analyzeBlocks(blocks: ContentBlock[]): BlockAnalysis {
  if (!blocks.length) {
    return {
      standardAvailable: true,
      value: { doc: emptyDoc(), html: "", text: "" },
      migratesLegacy: false,
      preservedBlocks: [],
    };
  }

  if (blocks[0].type === "rich_text" && !blocks.slice(1).some((block) => block.type === "rich_text")) {
    const data = blocks[0].data || {};
    const doc = data.doc && typeof data.doc === "object" ? data.doc as RichTextDoc : emptyDoc();

    return {
      standardAvailable: true,
      existingId: blocks[0].id,
      value: {
        doc,
        html: typeof data.html === "string" ? data.html : "",
        text: typeof data.text === "string" ? data.text : "",
      },
      migratesLegacy: false,
      preservedBlocks: blocks.slice(1),
    };
  }

  const firstUnsafeIndex = blocks.findIndex((block) => !isSafeLegacyBlock(block));
  const legacyPrefix = firstUnsafeIndex === -1 ? blocks : blocks.slice(0, firstUnsafeIndex);
  const preservedSuffix = firstUnsafeIndex === -1 ? [] : blocks.slice(firstUnsafeIndex);
  const safeSuffix = preservedSuffix.every(
    (block) => block.type !== "rich_text" && !isSafeLegacyBlock(block),
  );

  if (legacyPrefix.length > 0 && safeSuffix) {
    return {
      standardAvailable: true,
      value: { doc: legacyBlocksToDoc(legacyPrefix), html: "", text: "" },
      migratesLegacy: true,
      preservedBlocks: preservedSuffix,
    };
  }

  return {
    standardAvailable: false,
    value: { doc: emptyDoc(), html: "", text: "" },
    migratesLegacy: false,
    preservedBlocks: [],
    reason: "چیدمان این محتوا ترکیبی یا دارای بلوک‌های سفارشی میان متن است. برای جلوگیری از جابه‌جایی یا حذف داده، فعلاً در حالت بلوک‌های پیشرفته ویرایش می‌شود.",
  };
}

function uid() {
  return `rich_text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function richTextValueToBlock(value: RichTextValue, existingId?: string): ContentBlock {
  return {
    id: existingId || uid(),
    type: "rich_text",
    data: {
      format: "tiptap-json",
      version: 1,
      doc: value.doc,
      html: value.html,
      text: value.text,
    },
  };
}
