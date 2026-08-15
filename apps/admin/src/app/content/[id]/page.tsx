"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BlockEditor, { ContentBlock } from "@/components/BlockEditor";
import InternalLinksPanel from "@/components/InternalLinksPanel";
import PageHeader from "@/components/PageHeader";
import RevisionPanel from "@/components/RevisionPanel";
import SchemaBuilder from "@/components/SchemaBuilder";
import SeoPanel from "@/components/SeoPanel";
import { apiFetch } from "@/lib/api";

export default function EditContent() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    apiFetch<any>(`/content/entries/${id}/`).then((d) => setF({ ...d, blocks: (d.blocks || []) as ContentBlock[] }));
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
    setF({ ...saved, blocks: (saved.blocks || []) as ContentBlock[] });
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

  async function publish() {
    try {
      await saveEntry(false);
      const published = await apiFetch<any>(`/content/entries/${id}/publish/`, { method: "POST", body: "{}" });
      setF({ ...published, blocks: (published.blocks || []) as ContentBlock[] });
      setMsg("منتشر شد");
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

  if (!f) return <div>در حال بارگذاری...</div>;

  return (
    <>
      <PageHeader
        title={`ویرایش: ${f.title}`}
        description={f.path}
        action={
          <div className="editorHeaderActions">
            <button type="button" className="btn secondary" onClick={preview} disabled={previewing}>{previewing ? "در حال ساخت..." : "پیش‌نمایش"}</button>
            <button type="button" className="btn secondary" onClick={publish}>انتشار</button>
          </div>
        }
      />
      <form className="form" onSubmit={submit}>
        {msg && <div className={msg.includes("شد") || msg.includes("ساخته") ? "notice" : "error"}>{msg}</div>}
        <div className="formGrid">
          <div className="field">
            <label>عنوان</label>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
          <div className="field">
            <label>Slug</label>
            <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
          </div>
          <div className="field full">
            <label>Path</label>
            <input dir="ltr" value={f.path} onChange={(e) => setF({ ...f, path: e.target.value })} />
          </div>
          <div className="field full">
            <label>خلاصه</label>
            <textarea style={{ fontFamily: "inherit", direction: "rtl", textAlign: "right" }} value={f.excerpt} onChange={(e) => setF({ ...f, excerpt: e.target.value })} />
          </div>
          <div className="field">
            <label>وضعیت</label>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="field full">
            <label>محتوا</label>
            <BlockEditor value={f.blocks || []} onChange={(blocks) => setF({ ...f, blocks })} />
          </div>
        </div>
        <div className="actions"><button className="btn">ذخیره تغییرات</button></div>
      </form>

      <SeoPanel entryId={id} pageTitle={f.title} pagePath={f.path} />
      <SchemaBuilder entryId={id} pageTitle={f.title} pagePath={f.path} blocks={f.blocks || []} />
      <InternalLinksPanel entryId={id} />
      <RevisionPanel
        entryId={id}
        current={f}
        onRestored={(entry) => setF({ ...entry, blocks: (entry.blocks || []) as ContentBlock[] })}
      />
    </>
  );
}
