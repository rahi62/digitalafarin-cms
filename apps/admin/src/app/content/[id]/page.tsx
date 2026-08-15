"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BlockEditor, { ContentBlock } from "@/components/BlockEditor";
import CustomFieldsEditor, { ContentTypeSchema } from "@/components/CustomFieldsEditor";
import EditorialWorkflowPanel from "@/components/EditorialWorkflowPanel";
import InternalLinksPanel from "@/components/InternalLinksPanel";
import PageHeader from "@/components/PageHeader";
import ParentEntryField from "@/components/ParentEntryField";
import RevisionPanel from "@/components/RevisionPanel";
import SchemaBuilder from "@/components/SchemaBuilder";
import SeoPanel from "@/components/SeoPanel";
import TaxonomyFields from "@/components/TaxonomyFields";
import { apiFetch } from "@/lib/api";

type ContentType = { id: string; name: string; slug: string; schema: ContentTypeSchema };

export default function EditContent() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<any>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [msg, setMsg] = useState("");
  const [previewing, setPreviewing] = useState(false);

  function normalizeEntry(entry: any) {
    return {
      ...entry,
      categories: entry.categories || [],
      tags: entry.tags || [],
      custom_fields: entry.custom_fields || {},
      blocks: (entry.blocks || []) as ContentBlock[],
    };
  }

  useEffect(() => {
    let cancelled = false;
    apiFetch<any>(`/content/entries/${id}/`).then(async (d) => {
      if (cancelled) return;
      setF(normalizeEntry(d));
      try {
        const type = await apiFetch<ContentType>(`/content/types/${d.content_type}/`);
        if (!cancelled) setContentType(type);
      } catch (error) {
        if (!cancelled) setMsg(error instanceof Error ? error.message : "خطا در بارگذاری Content Type");
      }
    }).catch((error) => {
      if (!cancelled) setMsg(error instanceof Error ? error.message : "خطا در بارگذاری محتوا");
    });
    return () => { cancelled = true; };
  }, [id]);

  function payload() {
    const body = { ...f };
    delete body.author;
    delete body.author_name;
    delete body.content_type_slug;
    delete body.created_at;
    delete body.updated_at;
    delete body.published_at;
    return body;
  }

  async function saveEntry(showMessage = true) {
    const saved = await apiFetch<any>(`/content/entries/${id}/`, { method: "PUT", body: JSON.stringify(payload()) });
    setF(normalizeEntry(saved));
    if (showMessage) setMsg("ذخیره شد");
    return saved;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await saveEntry(true);
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function preview() {
    setPreviewing(true);
    setMsg("");
    try {
      await saveEntry(false);
      const data = await apiFetch<{ frontend_url: string; expires_in: number }>(`/content/entries/${id}/preview/`, { method: "POST", body: "{}" });
      window.open(data.frontend_url, "_blank", "noopener,noreferrer");
      setMsg(`پیش‌نمایش امن برای ${Math.round(data.expires_in / 60)} دقیقه ساخته شد`);
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setPreviewing(false);
    }
  }

  if (!f) return <div>{msg || "در حال بارگذاری..."}</div>;

  return (
    <>
      <PageHeader
        title={`ویرایش: ${f.title}`}
        description={`${f.path}${contentType ? ` · ${contentType.name}` : ""}`}
        action={<button type="button" className="btn secondary" onClick={preview} disabled={previewing}>{previewing ? "در حال ساخت..." : "پیش‌نمایش"}</button>}
      />
      <form className="form" onSubmit={submit}>
        {msg && <div className={msg.includes("شد") || msg.includes("ساخته") ? "notice" : "error"}>{msg}</div>}
        <div className="formGrid">
          <div className="field"><label>عنوان</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="field"><label>Slug</label><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></div>
          <div className="field full"><label>Path</label><input dir="ltr" value={f.path} onChange={(e) => setF({ ...f, path: e.target.value })} /></div>
          <div className="field full"><label>خلاصه</label><textarea style={{ fontFamily: "inherit", direction: "rtl", textAlign: "right" }} value={f.excerpt} onChange={(e) => setF({ ...f, excerpt: e.target.value })} /></div>
          <div className="field"><label>وضعیت Workflow</label><input value={f.status} readOnly className="readonlyField" /></div>
          <ParentEntryField siteId={f.site} entryId={id} value={f.parent || null} onChange={(parent) => setF({ ...f, parent })} />
          <label className="featuredField"><input type="checkbox" checked={Boolean(f.is_featured)} onChange={(e) => setF({ ...f, is_featured: e.target.checked })} /><span><strong>محتوای ویژه</strong><small>برای Featured sections و اولویت نمایش.</small></span></label>

          <TaxonomyFields siteId={f.site} categories={f.categories || []} tags={f.tags || []} onCategoriesChange={(categories) => setF({ ...f, categories })} onTagsChange={(tags) => setF({ ...f, tags })} />
          <CustomFieldsEditor schema={contentType?.schema} value={f.custom_fields || {}} siteId={f.site} onChange={(custom_fields) => setF({ ...f, custom_fields })} />

          <div className="field full"><label>محتوا</label><BlockEditor siteId={f.site} value={f.blocks || []} onChange={(blocks) => setF({ ...f, blocks })} /></div>
        </div>
        <div className="actions"><button className="btn">ذخیره تغییرات</button></div>
      </form>

      <EditorialWorkflowPanel entryId={id} onUpdated={(entry) => setF(normalizeEntry(entry))} />
      <SeoPanel entryId={id} pageTitle={f.title} pagePath={f.path} />
      <SchemaBuilder entryId={id} pageTitle={f.title} pagePath={f.path} blocks={f.blocks || []} />
      <InternalLinksPanel entryId={id} />
      <RevisionPanel entryId={id} current={f} onRestored={(entry) => setF(normalizeEntry(entry))} />
    </>
  );
}
