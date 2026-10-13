"use client";

import { useEffect, useState } from "react";
import { apiFetch, Paginated } from "@/lib/api";
import MediaPicker, { MediaAsset } from "@/components/MediaPicker";
import type { CustomFieldDefinition } from "@/components/CustomFieldsEditor";
import type { ReactNode } from "react";

type Properties = {
  field: CustomFieldDefinition;
  value: unknown;
  siteId?: string;
  onChange: (next: unknown) => void;
  renderChildren: (fields: CustomFieldDefinition[], values: Record<string, unknown>, update: (next: Record<string, unknown>) => void) => ReactNode;
};
const asObject = (input: unknown): Record<string, unknown> => input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
const asArray = (input: unknown): unknown[] => Array.isArray(input) ? input : [];
function initialValues(fields: CustomFieldDefinition[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  fields.forEach((item) => {
    result[item.key] = item.default !== undefined ? item.default
      : item.type === "boolean" ? false
      : item.type === "group" ? initialValues(item.fields || [])
      : item.type === "repeater" || item.type === "gallery" ? [] : "";
  });
  return result;
}

export default function AdvancedField({ field, value, siteId, onChange, renderChildren }: Properties) {
  const type = field.type;
  const nested = field.fields || [];
  if (type === "group") return <div className="cmsNestedGroup">
    {renderChildren(nested, asObject(value), (next) => onChange(next))}
  </div>;
  if (type === "repeater") {
    const rows = asArray(value);
    const limit = field.max_items ?? 50;
    const move = (index: number, delta: number) => {
      const other = index + delta;
      if (other < 0 || other >= rows.length) return;
      const result = [...rows];
      [result[index], result[other]] = [result[other], result[index]];
      onChange(result);
    };
    return <div className="cmsNestedRepeater">
      {rows.map((row, index) => <div className="cmsNestedItem" key={index}>
        <div className="cmsNestedItemHead"><strong>مورد {(index + 1).toLocaleString("fa-IR")}</strong>
          <div>
            <button type="button" className="btn secondary small" disabled={index === 0} onClick={() => move(index, -1)} aria-label="انتقال مورد به بالا">↑</button>
            <button type="button" className="btn secondary small" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label="انتقال مورد به پایین">↓</button>
            <button type="button" className="btn secondary small" onClick={() => onChange(rows.filter((_, pos) => pos !== index))}>حذف</button>
          </div>
        </div>
        {renderChildren(nested, asObject(row), (next) => onChange(rows.map((item, pos) => pos === index ? next : item)))}
      </div>)}
      <button type="button" className="btn secondary small" disabled={rows.length >= limit} onClick={() => onChange([...rows, initialValues(nested)])}>
        + افزودن مورد ({rows.length.toLocaleString("fa-IR")} / {limit.toLocaleString("fa-IR")})
      </button>
    </div>;
  }
  if (type === "gallery") return <GalleryField value={asArray(value)} siteId={siteId} onChange={onChange} maxItems={field.max_items ?? 50} />;
  if (type === "relation") return <RelationField value={typeof value === "string" ? value : ""} siteId={siteId}
    targetSlug={field.target_content_type || ""} onChange={onChange} />;
  return null;
}

function GalleryField({ value, onChange, siteId, maxItems }: {
  value: unknown[]; onChange: (next: unknown) => void; siteId?: string; maxItems: number;
}) {
  const [open, setOpen] = useState(false);
  const urls = value.filter((item): item is string => typeof item === "string");
  return <div className="cmsNestedGallery">
    <div className="cmsNestedThumbnails">
      {urls.map((url, index) => <div className="cmsNestedThumb" key={String(index) + url}>
        <img src={url} alt={"تصویر " + (index + 1)} loading="lazy" />
        <button type="button" aria-label="حذف تصویر" onClick={() => onChange(urls.filter((_, pos) => pos !== index))}>×</button>
      </div>)}
    </div>
    <button type="button" className="btn secondary small" disabled={urls.length >= maxItems} onClick={() => setOpen(true)}>+ انتخاب تصویر</button>
    <MediaPicker siteId={siteId} open={open} onClose={() => setOpen(false)}
      onSelect={(asset: MediaAsset) => { if (asset.url && urls.length < maxItems) onChange([...urls, asset.url]); setOpen(false); }} />
  </div>;
}

function RelationField({ siteId, targetSlug, value, onChange }: {
  siteId?: string; targetSlug: string; value: string; onChange: (next: unknown) => void;
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; title: string; path: string }>>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!siteId || !targetSlug) return;
    let active = true;
    setLoading(true); setError("");
    const params = new URLSearchParams({ site: siteId, page_size: "100" });
    apiFetch<Paginated<{ id: string; slug: string }>>("/content/types/?" + params)
      .then(async (types) => {
        const contentType = types.results.find((item) => item.slug === targetSlug);
        if (!contentType) throw new Error("نوع محتوای مقصد در سایت پیدا نشد.");
        const query = new URLSearchParams({ site: siteId, content_type: contentType.id, page_size: "20" });
        if (search.trim()) query.set("search", search.trim());
        const entries = await apiFetch<Paginated<{ id: string; title: string; path: string }>>("/content/entries/?" + query);
        if (active) setRows(entries.results);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "جستجو ناموفق بود"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [siteId, targetSlug, search]);

  useEffect(() => {
    if (!value || !siteId) { setSelectedTitle(""); return; }
    const found = rows.find((item) => item.id === value);
    if (found) { setSelectedTitle(found.title); return; }
    let active = true;
    apiFetch<{ title: string; site: string }>("/content/entries/" + value + "/")
      .then((item) => { if (active) setSelectedTitle(item.site === siteId ? item.title : ""); })
      .catch(() => { if (active) setSelectedTitle(""); });
    return () => { active = false; };
  }, [value, rows, siteId]);

  return <div className="cmsNestedRelation">
    {value && <div className="cmsNestedSelected"><span>انتخاب‌شده: {selectedTitle || value}</span>
      <button type="button" className="btn secondary small" onClick={() => onChange("")}>حذف انتخاب</button></div>}
    <input aria-label="جستجوی محتوای مرتبط" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={"جستجو در " + targetSlug} />
    {loading && <small role="status">در حال جستجو...</small>}
    {error && <small className="fieldError" role="alert">{error}</small>}
    <div className="cmsNestedSearch">
      {rows.map((item) => <button type="button" key={item.id} className={item.id === value ? "isSelected" : ""}
        onClick={() => { setSelectedTitle(item.title); onChange(item.id); }}>
        <strong>{item.title}</strong><small dir="ltr">{item.path}</small>
      </button>)}
    </div>
  </div>;
}
