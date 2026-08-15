"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import BlockEditor, { ContentBlock } from "@/components/BlockEditor";
import CustomFieldsEditor, { ContentTypeSchema, customFieldDefaults } from "@/components/CustomFieldsEditor";
import PageHeader from "@/components/PageHeader";
import TaxonomyFields from "@/components/TaxonomyFields";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string };
type ContentType = { id: string; site: string; name: string; slug: string; schema: ContentTypeSchema };

export default function NewContent() {
  const [sites, setSites] = useState<Site[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState<any>({
    site: "",
    content_type: "",
    title: "",
    slug: "",
    path: "/",
    excerpt: "",
    status: "draft",
    categories: [],
    tags: [],
    custom_fields: {},
    blocks: [{ id: "p-1", type: "paragraph", data: { text: "" } }] as ContentBlock[],
  });

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/").then((d) => {
      setSites(d.results);
      if (d.results[0]) setF((x: any) => ({ ...x, site: d.results[0].id }));
    });
    apiFetch<Paginated<ContentType>>("/content/types/").then((d) => setTypes(d.results));
  }, []);

  const siteTypes = useMemo(() => types.filter((type) => type.site === f.site), [types, f.site]);
  const selectedType = useMemo(() => types.find((type) => type.id === f.content_type) || null, [types, f.content_type]);

  useEffect(() => {
    if (!f.site || siteTypes.length === 0) return;
    if (!siteTypes.some((type) => type.id === f.content_type)) {
      const type = siteTypes[0];
      setF((current: any) => ({
        ...current,
        content_type: type.id,
        custom_fields: customFieldDefaults(type.schema),
      }));
    }
  }, [f.site, siteTypes, f.content_type]);

  function selectType(typeId: string) {
    const type = types.find((item) => item.id === typeId);
    setF({ ...f, content_type: typeId, custom_fields: customFieldDefaults(type?.schema) });
  }

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
      <PageHeader title="محتوای جدید" description="ساخت Entry با Visual Block Editor، Custom Fields و Taxonomies" />
      <form className="form" onSubmit={submit}>
        {msg && <div className="error">{msg}</div>}
        <div className="formGrid">
          <div className="field">
            <label>سایت</label>
            <select value={f.site} onChange={(e) => setF({ ...f, site: e.target.value, content_type: "", categories: [], tags: [], custom_fields: {} })}>
              {sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>نوع محتوا</label>
            <select value={f.content_type} onChange={(e) => selectType(e.target.value)}>
              {siteTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {siteTypes.length === 0 && <small>برای این سایت ابتدا یک Content Type بسازید.</small>}
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

          <TaxonomyFields
            siteId={f.site}
            categories={f.categories || []}
            tags={f.tags || []}
            onCategoriesChange={(categories) => setF({ ...f, categories })}
            onTagsChange={(tags) => setF({ ...f, tags })}
          />

          <CustomFieldsEditor
            schema={selectedType?.schema}
            value={f.custom_fields || {}}
            siteId={f.site}
            onChange={(custom_fields) => setF({ ...f, custom_fields })}
          />

          <div className="field full">
            <label>محتوا</label>
            <BlockEditor siteId={f.site} value={f.blocks} onChange={(blocks) => setF({ ...f, blocks })} />
          </div>
        </div>
        <div className="actions"><button className="btn" disabled={!f.content_type}>ذخیره</button></div>
      </form>
    </>
  );
}
