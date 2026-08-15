"use client";

import { FormEvent, useEffect, useState } from "react";
import BlockEditor, { ContentBlock } from "@/components/BlockEditor";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

export default function NewContent() {
  const [sites, setSites] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState<any>({
    site: "",
    content_type: "",
    title: "",
    slug: "",
    path: "/",
    excerpt: "",
    status: "draft",
    blocks: [{ id: "p-1", type: "paragraph", data: { text: "" } }] as ContentBlock[],
  });

  useEffect(() => {
    apiFetch<Paginated<any>>("/sites/").then((d) => {
      setSites(d.results);
      if (d.results[0]) setF((x: any) => ({ ...x, site: d.results[0].id }));
    });
    apiFetch<Paginated<any>>("/content/types/").then((d) => {
      setTypes(d.results);
      if (d.results[0]) setF((x: any) => ({ ...x, content_type: d.results[0].id }));
    });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      const d: any = await apiFetch("/content/entries/", {
        method: "POST",
        body: JSON.stringify(f),
      });
      location.href = `/content/${d.id}`;
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  return (
    <>
      <PageHeader title="محتوای جدید" description="ساخت Entry با Visual Block Editor" />
      <form className="form" onSubmit={submit}>
        {msg && <div className="error">{msg}</div>}
        <div className="formGrid">
          <div className="field">
            <label>سایت</label>
            <select value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })}>
              {sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>نوع محتوا</label>
            <select value={f.content_type} onChange={(e) => setF({ ...f, content_type: e.target.value })}>
              {types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
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
              <option value="published">Published</option>
            </select>
          </div>
          <div className="field full">
            <label>محتوا</label>
            <BlockEditor value={f.blocks} onChange={(blocks) => setF({ ...f, blocks })} />
          </div>
        </div>
        <div className="actions"><button className="btn">ذخیره</button></div>
      </form>
    </>
  );
}
