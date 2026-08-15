"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";
import type { CustomFieldDefinition, CustomFieldType, ContentTypeSchema } from "@/components/CustomFieldsEditor";

type Site = { id: string; name: string; domain: string };
type ContentType = {
  id?: string;
  site: string;
  name: string;
  slug: string;
  icon: string;
  is_public: boolean;
  schema: ContentTypeSchema;
};

const fieldTypes: Array<{ value: CustomFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "select", label: "Select" },
  { value: "media", label: "Media" },
  { value: "json", label: "JSON" },
];

const presets: Record<string, CustomFieldDefinition[]> = {
  article: [
    { key: "subtitle", label: "زیرعنوان", type: "text" },
    { key: "reading_time", label: "زمان مطالعه", type: "number" },
    { key: "featured_image", label: "تصویر شاخص", type: "media" },
  ],
  product: [
    { key: "price", label: "قیمت", type: "number", required: true },
    { key: "sku", label: "SKU", type: "text" },
    { key: "featured_image", label: "تصویر محصول", type: "media" },
    { key: "available", label: "موجود", type: "boolean", default: true },
  ],
  tour: [
    { key: "destination", label: "مقصد", type: "text", required: true },
    { key: "duration_days", label: "مدت سفر (روز)", type: "number" },
    { key: "price", label: "قیمت", type: "number" },
    { key: "departure_date", label: "تاریخ حرکت", type: "date" },
    { key: "hero_image", label: "تصویر اصلی", type: "media" },
  ],
  service: [
    { key: "price_from", label: "شروع قیمت", type: "number" },
    { key: "cta_label", label: "متن CTA", type: "text" },
    { key: "cta_url", label: "لینک CTA", type: "url" },
  ],
};

function emptyType(site = ""): ContentType {
  return { site, name: "", slug: "", icon: "", is_public: true, schema: { fields: [] } };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function normalizeField(field: CustomFieldDefinition): CustomFieldDefinition {
  return {
    key: field.key || "field",
    label: field.label || "",
    type: field.type || "text",
    required: Boolean(field.required),
    help_text: field.help_text || "",
    placeholder: field.placeholder || "",
    default: field.default,
    options: field.options || [],
  };
}

export default function ContentTypesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [rows, setRows] = useState<ContentType[]>([]);
  const [editing, setEditing] = useState<ContentType>(() => emptyType());
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadTypes(siteId = site) {
    if (!siteId) return;
    try {
      const data = await apiFetch<Paginated<ContentType>>(`/content/types/?site=${encodeURIComponent(siteId)}`);
      setRows(data.results);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری Content Typeها");
    }
  }

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/").then((data) => {
      setSites(data.results);
      if (data.results[0]) {
        setSite(data.results[0].id);
        setEditing(emptyType(data.results[0].id));
      }
    }).catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری سایت‌ها"));
  }, []);

  useEffect(() => {
    if (!site) return;
    loadTypes(site);
    setEditing(emptyType(site));
  }, [site]);

  const fields = useMemo(
    () => (editing.schema?.fields || []).map(normalizeField),
    [editing.schema],
  );

  function setFields(next: CustomFieldDefinition[]) {
    setEditing((current) => ({ ...current, schema: { ...current.schema, fields: next } }));
  }

  function patchField(index: number, patch: Partial<CustomFieldDefinition>) {
    setFields(fields.map((field, i) => i === index ? { ...field, ...patch } : field));
  }

  function addField() {
    const nextNumber = fields.length + 1;
    setFields([...fields, normalizeField({ key: `field_${nextNumber}`, label: `فیلد ${nextNumber}`, type: "text" })]);
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next);
  }

  function applyPreset(name: string) {
    const preset = presets[name];
    if (!preset) return;
    setFields(preset.map(normalizeField));
  }

  async function save() {
    if (!editing.site || !editing.name.trim() || !editing.slug.trim()) {
      setMessage("سایت، نام و slug الزامی هستند");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        site: editing.site,
        name: editing.name.trim(),
        slug: editing.slug.trim(),
        icon: editing.icon.trim(),
        is_public: editing.is_public,
        schema: { ...editing.schema, fields },
      };
      const saved = editing.id
        ? await apiFetch<ContentType>(`/content/types/${editing.id}/`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch<ContentType>("/content/types/", { method: "POST", body: JSON.stringify(payload) });
      setEditing(saved);
      setMessage("Content Type ذخیره شد");
      await loadTypes(saved.site);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره Content Type");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing.id) return;
    if (!window.confirm(`Content Type «${editing.name}» حذف شود؟`)) return;
    try {
      await apiFetch(`/content/types/${editing.id}/`, { method: "DELETE" });
      setMessage("Content Type حذف شد");
      setEditing(emptyType(site));
      await loadTypes(site);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حذف نشد؛ ممکن است محتوا به این Type متصل باشد");
    }
  }

  return (
    <>
      <PageHeader
        title="Content Type Builder"
        description="تعریف ساختارهای محتوایی و فیلدهای اختصاصی بدون تغییر مدل‌های Django"
        action={<button className="btn" onClick={() => setEditing(emptyType(site))}>+ نوع محتوای جدید</button>}
      />

      {message && <div className={message.includes("شد") ? "notice" : "error"}>{message}</div>}

      <div className="contentTypeLayout">
        <aside className="panel contentTypeList">
          <div className="field">
            <label>سایت</label>
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              {sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}
            </select>
          </div>
          <div className="contentTypeListHeader">
            <strong>ساختارها</strong>
            <span>{rows.length}</span>
          </div>
          <div className="contentTypeCards">
            {rows.map((item) => (
              <button type="button" key={item.id} className={editing.id === item.id ? "active" : ""} onClick={() => setEditing({ ...item, schema: item.schema || { fields: [] } })}>
                <span className="contentTypeIcon">{item.icon || "◇"}</span>
                <span><strong>{item.name}</strong><small>/{item.slug} · {(item.schema?.fields || []).length} field</small></span>
                <b>{item.is_public ? "Public" : "Private"}</b>
              </button>
            ))}
            {rows.length === 0 && <div className="emptyState">برای این سایت هنوز Content Type ساخته نشده است.</div>}
          </div>
        </aside>

        <main className="panel contentTypeEditor">
          <div className="contentTypeEditorHeader">
            <div><h2>{editing.id ? `ویرایش ${editing.name}` : "Content Type جدید"}</h2><p>فیلدها داخل `custom_fields` ذخیره می‌شوند و API/SDK فعلی را نمی‌شکنند.</p></div>
            {editing.id && <span className="badge">{editing.slug}</span>}
          </div>

          <div className="formGrid">
            <div className="field"><label>نام</label><input value={editing.name} onChange={(e) => {
              const name = e.target.value;
              setEditing((current) => ({ ...current, name, slug: current.id || current.slug ? current.slug : slugify(name) }));
            }} placeholder="مثلاً Tour" /></div>
            <div className="field"><label>Slug</label><input dir="ltr" value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} placeholder="tour" /></div>
            <div className="field"><label>Icon</label><input value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} placeholder="✈" /></div>
            <label className="contentTypePublic"><input type="checkbox" checked={editing.is_public} onChange={(e) => setEditing({ ...editing, is_public: e.target.checked })} /><span><strong>Public</strong><small>قابل استفاده در خروجی عمومی سایت</small></span></label>
          </div>

          <div className="fieldBuilderHeader">
            <div><h3>Custom Fields</h3><p>ترتیب این فیلدها همان ترتیب نمایش در Content Editor است.</p></div>
            <div className="fieldBuilderActions">
              <select defaultValue="" onChange={(e) => { if (e.target.value) applyPreset(e.target.value); e.currentTarget.value = ""; }}>
                <option value="">اعمال Preset...</option>
                <option value="article">Article</option>
                <option value="product">Product</option>
                <option value="tour">Tour</option>
                <option value="service">Service</option>
              </select>
              <button type="button" className="btn secondary" onClick={addField}>+ افزودن فیلد</button>
            </div>
          </div>

          <div className="fieldBuilderList">
            {fields.map((field, index) => (
              <div className="fieldBuilderRow" key={`${field.key}-${index}`}>
                <div className="fieldBuilderOrder"><span>{index + 1}</span><button type="button" disabled={index === 0} onClick={() => moveField(index, -1)}>↑</button><button type="button" disabled={index === fields.length - 1} onClick={() => moveField(index, 1)}>↓</button></div>
                <div className="fieldBuilderInputs">
                  <div className="field"><label>Label</label><input value={field.label || ""} onChange={(e) => patchField(index, { label: e.target.value })} /></div>
                  <div className="field"><label>Key</label><input dir="ltr" value={field.key} onChange={(e) => patchField(index, { key: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></div>
                  <div className="field"><label>Type</label><select value={field.type || "text"} onChange={(e) => patchField(index, { type: e.target.value as CustomFieldType })}>{fieldTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                  <label className="fieldRequired"><input type="checkbox" checked={Boolean(field.required)} onChange={(e) => patchField(index, { required: e.target.checked })} /> Required</label>
                  <div className="field"><label>Placeholder</label><input value={field.placeholder || ""} onChange={(e) => patchField(index, { placeholder: e.target.value })} /></div>
                  <div className="field"><label>Help text</label><input value={field.help_text || ""} onChange={(e) => patchField(index, { help_text: e.target.value })} /></div>
                  {field.type === "select" && <div className="field full"><label>Options — جداشده با کاما</label><input value={(field.options || []).map((option) => typeof option === "string" ? option : option.value).join(", ")} onChange={(e) => patchField(index, { options: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></div>}
                </div>
                <button type="button" className="fieldBuilderDelete" onClick={() => removeField(index)}>×</button>
              </div>
            ))}
            {fields.length === 0 && <button type="button" className="fieldBuilderEmpty" onClick={addField}><strong>هنوز فیلدی تعریف نشده</strong><span>اولین Custom Field را اضافه کنید.</span></button>}
          </div>

          <div className="contentTypeSaveBar">
            <button className="btn" type="button" disabled={saving} onClick={save}>{saving ? "در حال ذخیره..." : "ذخیره Content Type"}</button>
            {editing.id && <button type="button" className="btn dangerBtn" onClick={remove}>حذف</button>}
          </div>
        </main>
      </div>
    </>
  );
}
