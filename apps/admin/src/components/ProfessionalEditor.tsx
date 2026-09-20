"use client";

import { useEffect, useMemo, useState } from "react";
import BlockEditor, { ContentBlock } from "@/components/BlockEditor";
import RichTextEditor from "@/components/RichTextEditor";
import { analyzeBlocks, richTextValueToBlock, RichTextValue } from "@/lib/editor-block-adapter";

type Props = {
  value: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  siteId?: string;
};

export default function ProfessionalEditor({ value, onChange, siteId }: Props) {
  const analysis = useMemo(() => analyzeBlocks(value || []), [value]);
  const [mode, setMode] = useState<"standard" | "advanced">(analysis.standardAvailable ? "standard" : "advanced");

  useEffect(() => {
    if (!analysis.standardAvailable && mode === "standard") setMode("advanced");
  }, [analysis.standardAvailable, mode]);

  function updateRichText(next: RichTextValue) {
    if (!analysis.standardAvailable) return;
    onChange([
      richTextValueToBlock(next, analysis.existingId),
      ...analysis.preservedBlocks,
    ]);
  }

  return (
    <section className="professionalEditor">
      <div className="professionalEditorHeader">
        <div>
          <strong>ویرایشگر حرفه‌ای</strong>
          <span>نوشتن ساده و یکپارچه؛ ساختار فنی محتوا در پس‌زمینه حفظ می‌شود.</span>
        </div>
        <div className="editorModeTabs" role="tablist" aria-label="حالت ویرایش محتوا">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "standard"}
            className={mode === "standard" ? "active" : ""}
            disabled={!analysis.standardAvailable}
            onClick={() => setMode("standard")}
          >
            ویرایشگر استاندارد
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "advanced"}
            className={mode === "advanced" ? "active" : ""}
            onClick={() => setMode("advanced")}
          >
            بلوک‌های پیشرفته
          </button>
        </div>
      </div>

      {!analysis.standardAvailable && (
        <div className="editorCompatibilityNotice">
          <strong>حفاظت از محتوای موجود</strong>
          <span>{analysis.reason}</span>
        </div>
      )}

      {mode === "standard" && analysis.migratesLegacy && (
        <div className="editorMigrationNotice">
          این نوشته از بلوک‌های متنی قدیمی خوانده شده است. با اولین تغییر، بخش متنی به فرمت جدید Tiptap تبدیل می‌شود.
        </div>
      )}

      {mode === "standard" && analysis.preservedBlocks.length > 0 && (
        <div className="editorAdvancedPreservedNotice">
          <strong>{analysis.preservedBlocks.length.toLocaleString("fa-IR")} بلوک پیشرفته حفظ شده است</strong>
          <span>CTA، FAQ یا بلوک‌های سفارشی بدون تغییر پس از متن باقی می‌مانند؛ برای ویرایش آن‌ها از «بلوک‌های پیشرفته» استفاده کنید.</span>
        </div>
      )}

      {mode === "standard" && analysis.standardAvailable ? (
        <RichTextEditor value={analysis.value} onChange={updateRichText} siteId={siteId} />
      ) : (
        <BlockEditor siteId={siteId} value={value || []} onChange={onChange} />
      )}
    </section>
  );
}
