"use client";

import { useMemo, useState } from "react";
import MediaPicker, { MediaAsset } from "@/components/MediaPicker";

export type BlockType =
  | "paragraph"
  | "heading"
  | "image"
  | "quote"
  | "list"
  | "code"
  | "cta"
  | "faq"
  | "divider";

export type ContentBlock = {
  id: string;
  type: BlockType | string;
  data: Record<string, unknown>;
};

type Props = {
  value: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  siteId?: string;
};

type BlockDefinition = {
  type: BlockType;
  label: string;
  icon: string;
  initialData: Record<string, unknown>;
};

const definitions: BlockDefinition[] = [
  { type: "paragraph", label: "پاراگراف", icon: "¶", initialData: { text: "" } },
  { type: "heading", label: "تیتر", icon: "H", initialData: { text: "", level: 2 } },
  { type: "image", label: "تصویر", icon: "▧", initialData: { src: "", alt: "", caption: "", media_id: "" } },
  { type: "quote", label: "نقل‌قول", icon: "❝", initialData: { text: "", cite: "" } },
  { type: "list", label: "فهرست", icon: "☷", initialData: { items: [""], ordered: false } },
  { type: "code", label: "کد", icon: "</>", initialData: { code: "", language: "text" } },
  { type: "cta", label: "CTA", icon: "↗", initialData: { title: "", text: "", label: "", href: "" } },
  { type: "faq", label: "FAQ", icon: "?", initialData: { items: [{ question: "", answer: "" }] } },
  { type: "divider", label: "جداکننده", icon: "—", initialData: {} },
];

function uid(type: string) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function num(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function bool(value: unknown) {
  return value === true;
}

export default function BlockEditor({ value, onChange, siteId }: Props) {
  const [showLibrary, setShowLibrary] = useState(value.length === 0);
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState("");

  const blockCount = value.length;
  const words = useMemo(() => {
    const raw = value
      .map((block) => JSON.stringify(block.data))
      .join(" ")
      .replace(/[{}\[\]"_:,]/g, " ");
    return raw.split(/\s+/).filter(Boolean).length;
  }, [value]);

  function addBlock(definition: BlockDefinition) {
    onChange([
      ...value,
      {
        id: uid(definition.type),
        type: definition.type,
        data: cloneData(definition.initialData),
      },
    ]);
    setShowLibrary(false);
  }

  function patchBlock(index: number, data: Record<string, unknown>) {
    onChange(value.map((block, i) => (i === index ? { ...block, data: { ...block.data, ...data } } : block)));
  }

  function removeBlock(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function duplicateBlock(index: number) {
    const source = value[index];
    const copy = { ...source, id: uid(source.type), data: cloneData(source.data) };
    const next = [...value];
    next.splice(index + 1, 0, copy);
    onChange(next);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function openJson() {
    setJsonDraft(JSON.stringify(value, null, 2));
    setJsonError("");
    setShowJson(true);
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (!Array.isArray(parsed)) throw new Error("Root value must be an array");
      onChange(parsed as ContentBlock[]);
      setShowJson(false);
      setJsonError("");
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "JSON نامعتبر است");
    }
  }

  return (
    <div className="blockEditor">
      <div className="blockEditorTopbar">
        <div>
          <strong>Block Editor</strong>
          <span>{blockCount} بلوک · حدود {words} کلمه</span>
        </div>
        <div className="blockEditorTopActions">
          <button type="button" className="btn secondary small" onClick={openJson}>JSON</button>
          <button type="button" className="btn small" onClick={() => setShowLibrary((v) => !v)}>+ افزودن بلوک</button>
        </div>
      </div>

      {showLibrary && (
        <div className="blockLibrary">
          {definitions.map((definition) => (
            <button type="button" key={definition.type} onClick={() => addBlock(definition)}>
              <span>{definition.icon}</span>
              <strong>{definition.label}</strong>
            </button>
          ))}
        </div>
      )}

      <div className="blockCanvas">
        {value.length === 0 && (
          <button type="button" className="blockEmpty" onClick={() => setShowLibrary(true)}>
            <strong>محتوا هنوز بلوکی ندارد</strong>
            <span>برای شروع یک بلوک اضافه کنید.</span>
          </button>
        )}

        {value.map((block, index) => (
          <div className="editorBlock" key={block.id || `${block.type}-${index}`}>
            <div className="editorBlockHeader">
              <div className="editorBlockIdentity">
                <span className="editorBlockIndex">{index + 1}</span>
                <strong>{definitions.find((x) => x.type === block.type)?.label || block.type}</strong>
                <code>{block.type}</code>
              </div>
              <div className="editorBlockActions">
                <button type="button" title="بالا" disabled={index === 0} onClick={() => moveBlock(index, -1)}>↑</button>
                <button type="button" title="پایین" disabled={index === value.length - 1} onClick={() => moveBlock(index, 1)}>↓</button>
                <button type="button" title="تکثیر" onClick={() => duplicateBlock(index)}>⧉</button>
                <button type="button" className="danger" title="حذف" onClick={() => removeBlock(index)}>×</button>
              </div>
            </div>
            <BlockFields block={block} siteId={siteId} onChange={(data) => patchBlock(index, data)} />
          </div>
        ))}
      </div>

      {value.length > 0 && (
        <button type="button" className="addBlockInline" onClick={() => setShowLibrary(true)}>+ افزودن بلوک دیگر</button>
      )}

      {showJson && (
        <div className="jsonModalBackdrop" role="dialog" aria-modal="true">
          <div className="jsonModal">
            <div className="jsonModalHeader">
              <div>
                <strong>ویرایش پیشرفته JSON</strong>
                <span>برای مهاجرت، debug یا بلوک‌های سفارشی</span>
              </div>
              <button type="button" onClick={() => setShowJson(false)}>×</button>
            </div>
            {jsonError && <div className="error">{jsonError}</div>}
            <textarea dir="ltr" value={jsonDraft} onChange={(event) => setJsonDraft(event.target.value)} />
            <div className="actions">
              <button type="button" className="btn" onClick={applyJson}>اعمال JSON</button>
              <button type="button" className="btn secondary" onClick={() => setShowJson(false)}>انصراف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockFields({ block, siteId, onChange }: { block: ContentBlock; siteId?: string; onChange: (data: Record<string, unknown>) => void }) {
  const data = block.data || {};

  if (block.type === "paragraph") {
    return <textarea className="blockTextArea" placeholder="متن پاراگراف..." value={text(data.text)} onChange={(e) => onChange({ text: e.target.value })} />;
  }

  if (block.type === "heading") {
    return (
      <div className="blockFieldGrid headingFields">
        <select value={num(data.level, 2)} onChange={(e) => onChange({ level: Number(e.target.value) })}>
          {[2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>H{level}</option>)}
        </select>
        <input placeholder="متن تیتر" value={text(data.text)} onChange={(e) => onChange({ text: e.target.value })} />
      </div>
    );
  }

  if (block.type === "image") {
    return <ImageBlockFields data={data} siteId={siteId} onChange={onChange} />;
  }

  if (block.type === "quote") {
    return (
      <div className="blockFieldGrid">
        <textarea className="full" placeholder="متن نقل‌قول" value={text(data.text)} onChange={(e) => onChange({ text: e.target.value })} />
        <input className="full" placeholder="منبع / گوینده" value={text(data.cite)} onChange={(e) => onChange({ cite: e.target.value })} />
      </div>
    );
  }

  if (block.type === "list") {
    const items = Array.isArray(data.items) ? data.items.map(String) : [""];
    return (
      <div className="listBlockFields">
        <label className="checkRow">
          <input type="checkbox" checked={bool(data.ordered)} onChange={(e) => onChange({ ordered: e.target.checked })} />
          فهرست شماره‌دار
        </label>
        {items.map((item, itemIndex) => (
          <div className="listItemRow" key={itemIndex}>
            <span>{bool(data.ordered) ? `${itemIndex + 1}.` : "•"}</span>
            <input value={item} placeholder="آیتم فهرست" onChange={(e) => {
              const next = [...items];
              next[itemIndex] = e.target.value;
              onChange({ items: next });
            }} />
            <button type="button" onClick={() => onChange({ items: items.filter((_, i) => i !== itemIndex) })}>×</button>
          </div>
        ))}
        <button type="button" className="textButton" onClick={() => onChange({ items: [...items, ""] })}>+ افزودن آیتم</button>
      </div>
    );
  }

  if (block.type === "code") {
    return (
      <div className="blockFieldGrid">
        <input className="full" dir="ltr" placeholder="language: js, ts, python..." value={text(data.language)} onChange={(e) => onChange({ language: e.target.value })} />
        <textarea className="full codeEditor" dir="ltr" placeholder="کد..." value={text(data.code)} onChange={(e) => onChange({ code: e.target.value })} />
      </div>
    );
  }

  if (block.type === "cta") {
    return (
      <div className="blockFieldGrid">
        <input placeholder="عنوان CTA" value={text(data.title)} onChange={(e) => onChange({ title: e.target.value })} />
        <input placeholder="متن دکمه" value={text(data.label)} onChange={(e) => onChange({ label: e.target.value })} />
        <textarea className="full" placeholder="توضیح کوتاه" value={text(data.text)} onChange={(e) => onChange({ text: e.target.value })} />
        <input className="full" dir="ltr" placeholder="https://... یا /path" value={text(data.href)} onChange={(e) => onChange({ href: e.target.value })} />
      </div>
    );
  }

  if (block.type === "faq") {
    const items = Array.isArray(data.items)
      ? data.items.map((item) => ({
          question: typeof item === "object" && item ? text((item as Record<string, unknown>).question) : "",
          answer: typeof item === "object" && item ? text((item as Record<string, unknown>).answer) : "",
        }))
      : [{ question: "", answer: "" }];
    return (
      <div className="faqFields">
        {items.map((item, itemIndex) => (
          <div className="faqItem" key={itemIndex}>
            <input placeholder="سوال" value={item.question} onChange={(e) => {
              const next = [...items];
              next[itemIndex] = { ...next[itemIndex], question: e.target.value };
              onChange({ items: next });
            }} />
            <textarea placeholder="پاسخ" value={item.answer} onChange={(e) => {
              const next = [...items];
              next[itemIndex] = { ...next[itemIndex], answer: e.target.value };
              onChange({ items: next });
            }} />
            <button type="button" onClick={() => onChange({ items: items.filter((_, i) => i !== itemIndex) })}>حذف سوال</button>
          </div>
        ))}
        <button type="button" className="textButton" onClick={() => onChange({ items: [...items, { question: "", answer: "" }] })}>+ افزودن سوال</button>
      </div>
    );
  }

  if (block.type === "divider") {
    return <div className="dividerPreview"><span /></div>;
  }

  return (
    <div className="unknownBlock">
      بلوک سفارشی <code>{block.type}</code> از طریق حالت JSON قابل ویرایش است.
    </div>
  );
}

function ImageBlockFields({ data, siteId, onChange }: { data: Record<string, unknown>; siteId?: string; onChange: (data: Record<string, unknown>) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function selectAsset(asset: MediaAsset) {
    onChange({
      src: asset.url || "",
      media_id: asset.id,
      alt: asset.alt_text || text(data.alt),
      caption: asset.caption || text(data.caption),
      width: asset.width,
      height: asset.height,
    });
  }

  return (
    <div className="blockFieldGrid imageBlockFields">
      <div className="imageSourceRow full">
        <input dir="ltr" placeholder="https://... یا مسیر تصویر" value={text(data.src)} onChange={(e) => onChange({ src: e.target.value, media_id: "" })} />
        <button type="button" className="btn secondary small" onClick={() => setPickerOpen(true)}>انتخاب از رسانه</button>
      </div>
      <input placeholder="Alt تصویر" value={text(data.alt)} onChange={(e) => onChange({ alt: e.target.value })} />
      <input placeholder="Caption" value={text(data.caption)} onChange={(e) => onChange({ caption: e.target.value })} />
      {text(data.src) && (
        <div className="imageBlockPreview full">
          <img src={text(data.src)} alt={text(data.alt)} />
          <div className="imageBlockMeta">
            {data.media_id ? <span>متصل به Media Library</span> : <span>URL دستی</span>}
            {data.width && data.height ? <small>{String(data.width)} × {String(data.height)}</small> : null}
          </div>
        </div>
      )}
      <MediaPicker
        siteId={siteId}
        open={pickerOpen}
        imageOnly
        selectedUrl={text(data.src)}
        onClose={() => setPickerOpen(false)}
        onSelect={selectAsset}
      />
    </div>
  );
}
