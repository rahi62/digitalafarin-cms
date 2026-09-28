"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type ContentRouting = { collection_path?: string; entry_path_pattern?: string };
export default function ContentPathFields({ entry, contentType, onChange }: {
  entry: Record<string, any>;
  contentType: ContentRouting | null;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const [result, setResult] = useState<{ path?: string; error?: string }>({});
  const automatic = (entry.path_mode || (contentType?.entry_path_pattern ? "auto" : "manual")) === "auto";
  const payload = JSON.stringify({ id: entry.id, site: entry.site, content_type: entry.content_type,
    title: entry.title, slug: entry.slug, path: entry.path, path_mode: automatic ? "auto" : "manual",
    custom_fields: entry.custom_fields || {} });
  useEffect(() => {
    let cancelled = false;
    setResult({});
    const timer = setTimeout(() => {
      if (!entry.site || !entry.content_type || !entry.slug) return;
      apiFetch<{ path: string }>("/content/entries/path-preview/", { method: "POST", body: payload })
        .then((data) => { if (!cancelled) setResult(data); })
        .catch((error) => { if (!cancelled) setResult({ error: error.message }); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [payload]);
  return <div className="field full">
    <label>روش تعیین آدرس</label>
    <select value={automatic ? "auto" : "manual"} onChange={(e) => onChange({ path_mode: e.target.value })}>
      {contentType?.entry_path_pattern && <option value="auto">ساخت از الگوی نوع محتوا و slug</option>}
      <option value="manual">آدرس دستی (صفحه یا آدرس سفارشی)</option>
    </select>
    {automatic ? <small>الگو: <bdi dir="ltr">{contentType?.entry_path_pattern}</bdi>؛ مسیر فهرست: <bdi dir="ltr">{contentType?.collection_path}</bdi></small>
      : <><label htmlFor="content-path">Path</label><input id="content-path" dir="ltr" value={entry.path || ""} onChange={(e) => onChange({ path: e.target.value })} /><small>برای صفحهٔ اصلی / را وارد کنید. آدرس مقاله باید با آدرس فهرست متفاوت باشد.</small></>}
    <output aria-live="polite">آدرس نهایی: <bdi dir="ltr">{result.path || "پس از تکمیل اطلاعات، توسط سرور بررسی می‌شود"}</bdi></output>
    {result.error && <small className="error">{result.error}</small>}
    {entry.id && <small>تغییر آدرس محتوای منتشرشده، انتقال دائمی از آدرس قبلی ایجاد می‌کند.</small>}
  </div>;
}
