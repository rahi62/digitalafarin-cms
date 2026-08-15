"use client";

import { useMemo, useState } from "react";
import MediaPicker, { MediaAsset } from "@/components/MediaPicker";

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "url"
  | "email"
  | "select"
  | "media"
  | "json";

export type CustomFieldDefinition = {
  key: string;
  label?: string;
  type?: CustomFieldType | string;
  required?: boolean;
  help_text?: string;
  placeholder?: string;
  default?: unknown;
  options?: Array<string | { label: string; value: string }>;
};

export type ContentTypeSchema = {
  fields?: CustomFieldDefinition[];
};

type Props = {
  schema?: ContentTypeSchema | null;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  siteId?: string;
};

export function customFieldDefaults(schema?: ContentTypeSchema | null) {
  const result: Record<string, unknown> = {};
  for (const field of schema?.fields || []) {
    if (!field.key) continue;
    if (field.default !== undefined && field.default !== null) result[field.key] = field.default;
    else if (field.type === "boolean") result[field.key] = false;
    else result[field.key] = "";
  }
  return result;
}

export function mergeCustomFieldDefaults(schema: ContentTypeSchema | null | undefined, current: Record<string, unknown> = {}) {
  return { ...customFieldDefaults(schema), ...current };
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function optionsOf(field: CustomFieldDefinition) {
  return (field.options || []).map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  );
}

export default function CustomFieldsEditor({ schema, value, onChange, siteId }: Props) {
  const fields = useMemo(() => (schema?.fields || []).filter((field) => field.key), [schema]);

  if (fields.length === 0) return null;

  function patch(key: string, next: unknown) {
    onChange({ ...value, [key]: next });
  }

  return (
    <section className="customFieldsSection field full">
      <div className="customFieldsHeader">
        <div>
          <strong>فیلدهای اختصاصی</strong>
          <span>{fields.length} فیلد تعریف‌شده برای این نوع محتوا</span>
        </div>
      </div>
      <div className="customFieldsGrid">
        {fields.map((field) => (
          <DynamicField
            key={field.key}
            field={field}
            value={value[field.key]}
            siteId={siteId}
            onChange={(next) => patch(field.key, next)}
          />
        ))}
      </div>
    </section>
  );
}

function DynamicField({
  field,
  value,
  siteId,
  onChange,
}: {
  field: CustomFieldDefinition;
  value: unknown;
  siteId?: string;
  onChange: (value: unknown) => void;
}) {
  const type = field.type || "text";
  const label = field.label || field.key;
  const help = field.help_text || "";
  const placeholder = field.placeholder || "";

  return (
    <div className={`dynamicField ${type === "textarea" || type === "json" || type === "media" ? "wide" : ""}`}>
      <label>
        {label}
        {field.required && <span className="requiredMark">*</span>}
      </label>

      {type === "textarea" ? (
        <textarea value={stringValue(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : type === "number" ? (
        <input type="number" value={stringValue(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      ) : type === "boolean" ? (
        <label className="dynamicBoolean">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>{value === true ? "فعال" : "غیرفعال"}</span>
        </label>
      ) : type === "date" ? (
        <input type="date" value={stringValue(value)} onChange={(e) => onChange(e.target.value)} />
      ) : type === "datetime" ? (
        <input type="datetime-local" value={stringValue(value)} onChange={(e) => onChange(e.target.value)} />
      ) : type === "url" ? (
        <input type="url" dir="ltr" value={stringValue(value)} placeholder={placeholder || "https://..."} onChange={(e) => onChange(e.target.value)} />
      ) : type === "email" ? (
        <input type="email" dir="ltr" value={stringValue(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : type === "select" ? (
        <select value={stringValue(value)} onChange={(e) => onChange(e.target.value)}>
          <option value="">انتخاب کنید</option>
          {optionsOf(field).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : type === "media" ? (
        <MediaCustomField siteId={siteId} value={stringValue(value)} onChange={onChange} />
      ) : type === "json" ? (
        <JsonCustomField value={value} onChange={onChange} />
      ) : (
        <input value={stringValue(value)} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}

      {help && <small>{help}</small>}
    </div>
  );
}

function MediaCustomField({ siteId, value, onChange }: { siteId?: string; value: string; onChange: (value: unknown) => void }) {
  const [open, setOpen] = useState(false);

  function choose(asset: MediaAsset) {
    onChange(asset.url || "");
  }

  return (
    <div className="dynamicMediaField">
      <div className="dynamicMediaInput">
        <input dir="ltr" value={value} placeholder="https://..." onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn secondary small" onClick={() => setOpen(true)}>انتخاب رسانه</button>
      </div>
      {value && <div className="dynamicMediaPreview"><img src={value} alt="" /></div>}
      <MediaPicker siteId={siteId} open={open} selectedUrl={value} onClose={() => setOpen(false)} onSelect={choose} />
    </div>
  );
}

function JsonCustomField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const initial = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");

  function apply(next: string) {
    setDraft(next);
    try {
      const parsed = JSON.parse(next || "{}");
      setError("");
      onChange(parsed);
    } catch {
      setError("JSON نامعتبر است");
    }
  }

  return (
    <div className="dynamicJsonField">
      <textarea dir="ltr" value={draft} onChange={(e) => apply(e.target.value)} />
      {error && <small className="fieldError">{error}</small>}
    </div>
  );
}
