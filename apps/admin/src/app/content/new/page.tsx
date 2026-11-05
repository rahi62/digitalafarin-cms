"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ContentBlock } from "@/components/BlockEditor";
import ProfessionalEditor from "@/components/ProfessionalEditor";
import CustomFieldsEditor, { ContentTypeSchema, customFieldDefaults } from "@/components/CustomFieldsEditor";
import PageHeader from "@/components/PageHeader";
import ParentEntryField from "@/components/ParentEntryField";
import TaxonomyFields from "@/components/TaxonomyFields";
import ContentPathFields, { ContentRouting } from "@/components/ContentPathFields";
import { apiFetch, Paginated } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";

type Site = { id: string; name: string };
type ContentType = ContentRouting & { id: string; site: string; name: string; slug: string; kind?: "singleton" | "collection"; schema: ContentTypeSchema };

export default function NewContent() {
  const [sites, setSites] = useState<Site[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [msg, setMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const [singletonCheck, setSingletonCheck] = useState(false);
  const [singletonExisting, setSingletonExisting] = useState<{ entry_id: string; title: string; path: string; trashed: boolean } | null>(null);
  const [f, setF] = useState<any>({
    site: "", content_type: "", title: "", slug: "", path: "", excerpt: "",
    status: "draft", parent: null, is_featured: false, categories: [], tags: [], custom_fields: {},
    blocks: [] as ContentBlock[],
  });

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/").then((d) => {
      setSites(d.results);
      if (d.results[0]) setF((x: any) => ({ ...x, site: d.results[0].id }));
    }).catch((error) => setLoadingError(error instanceof Error ? error.message : "دریافت سایت‌ها ناموفق بود"));
    apiFetch<Paginated<ContentType>>("/content/types/?page_size=100").then((d) => setTypes(d.results)).catch((error) => setLoadingError(error instanceof Error ? error.message : "دریافت نوع محتوا ناموفق بود"));
  }, []);

  const siteTypes = useMemo(() => types.filter((type) => type.site === f.site), [types, f.site]);
  const selectedType = useMemo(() => types.find((type) => type.id === f.content_type) || null, [types, f.content_type]);

  useEffect(() => {
    if (!f.site || siteTypes.length === 0) return;
    if (!siteTypes.some((type) => type.id === f.content_type)) {
      const type = siteTypes[0];
      setF((current: any) => ({ ...current, content_type: type.id, custom_fields: customFieldDefaults(type.schema) }));
    }
  }, [f.site, siteTypes, f.content_type]);

  useEffect(() => {
    if (!selectedType || selectedType.kind !== "singleton") { setSingletonExisting(null); setSingletonCheck(false); return; }
    let active = true;
    setSingletonExisting(null); setSingletonCheck(true);
    apiFetch<{ exists: boolean; entry_id: string | null; title: string | null; path: string | null; trashed: boolean }>(`/content/types/${selectedType.id}/singleton-entry/`)
      .then((result) => { if (active) setSingletonExisting(result.exists && result.entry_id ? { entry_id: result.entry_id, title: result.title || "", path: result.path || "", trashed: result.trashed } : null); })
      .catch((cause) => { if (active) setLoadingError(cause instanceof Error ? cause.message : "بررسی صفحه یکتا ناموفق بود"); })
      .finally(() => { if (active) setSingletonCheck(false); });
    return () => { active = false; };
  }, [selectedType?.id, selectedType?.kind]);

  function selectType(typeId: string) {
    const type = types.find((item) => item.id === typeId);
    setF({ ...f, content_type: typeId, path_mode: type?.entry_path_pattern ? "auto" : "manual", custom_fields: customFieldDefaults(type?.schema) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!f.site || !f.content_type || !f.title.trim()) { setMsg("سایت، نوع محتوا و عنوان الزامی هستند."); return; }
    if (selectedType?.kind === "singleton" && (singletonCheck || singletonExisting)) { setMsg("این صفحه یکتا قبلاً ساخته شده است. از صفحه ویرایش آن استفاده کنید."); return; }
    setSubmitting(true);
    try {
      const d: any = await apiFetch("/content/entries/", { method: "POST", body: JSON.stringify(f) });
      location.href = adminPath(`/content/${d.id}`);
    } catch (err: any) {
      setMsg(err.message);
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <PageHeader title="محتوای جدید" description="ساخت پیش‌نویس یا ارسال برای بررسی؛ انتشار از گردش کار انجام می‌شود."
        action={<Link href={adminPath("/content")} className="btn secondary">بازگشت به محتواها</Link>} />
      <div className="cmsNewContentHint">۱. سایت و نوع محتوا را انتخاب کنید. ۲. عنوان، مسیر و محتوا را تنظیم کنید. ۳. پیش‌نویس را ایجاد کنید و سپس از صفحه ویرایش، سئو، اسکیما و انتشار را مدیریت کنید.</div>
      {selectedType?.kind === "singleton" && <div className="cmsSingletonHint" role="status">{singletonCheck ? "در حال بررسی صفحه یکتا..." : singletonExisting ? <><strong>این صفحه یکتا قبلاً ساخته شده است.</strong> <Link href={adminPath(singletonExisting.trashed ? "/content/trash" : `/content/${singletonExisting.entry_id}`)} className="btn secondary small">{singletonExisting.trashed ? "بازیابی از سطل زباله" : `ویرایش ${singletonExisting.title || singletonExisting.path}`}</Link></> : "این نوع محتوا فقط یک صفحه دارد. آدرس آن را به‌صورت دستی تعیین کنید."}</div>}
      <form className="form" onSubmit={submit}>
        {loadingError && <div className="error" role="alert">{loadingError}</div>}
        {msg && <div className="error" role="alert">{msg}</div>}
        <div className="formGrid">
          <div className="field"><label>سایت</label><select value={f.site} onChange={(e) => setF({ ...f, site: e.target.value, content_type: "", parent: null, categories: [], tags: [], custom_fields: {} })}>{sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div className="field"><label>نوع محتوا</label><select value={f.content_type} onChange={(e) => selectType(e.target.value)}>{siteTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>{siteTypes.length === 0 && <small>برای این سایت ابتدا یک Content Type بسازید.</small>}</div>
          <div className="field"><label>عنوان *</label><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="field"><label>Slug</label><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></div>
          <ContentPathFields entry={f} contentType={selectedType} onChange={(patch) => setF({ ...f, ...patch })} />
          <div className="field full"><label>خلاصه</label><textarea style={{ fontFamily: "inherit", direction: "rtl", textAlign: "right" }} value={f.excerpt} onChange={(e) => setF({ ...f, excerpt: e.target.value })} /></div>
          <div className="field"><label>وضعیت اولیه</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="draft">Draft</option><option value="review">In Review</option></select><small>Published و Scheduled بعد از ایجاد از Editorial Workflow انجام می‌شوند.</small></div>
          <ParentEntryField siteId={f.site} value={f.parent || null} onChange={(parent) => setF({ ...f, parent })} />
          <label className="featuredField"><input type="checkbox" checked={Boolean(f.is_featured)} onChange={(e) => setF({ ...f, is_featured: e.target.checked })} /><span><strong>محتوای ویژه</strong><small>برای Featured sections و اولویت نمایش.</small></span></label>

          <TaxonomyFields siteId={f.site} categories={f.categories || []} tags={f.tags || []} onCategoriesChange={(categories) => setF({ ...f, categories })} onTagsChange={(tags) => setF({ ...f, tags })} />
          <CustomFieldsEditor schema={selectedType?.schema} value={f.custom_fields || {}} siteId={f.site} onChange={(custom_fields) => setF({ ...f, custom_fields })} />
          <div className="field full contentEditorField"><label>محتوا</label><ProfessionalEditor siteId={f.site} value={f.blocks} onChange={(blocks) => setF({ ...f, blocks })} /></div>
        </div>
        <div className="actions cmsNewContentActions"><button className="btn" disabled={submitting || !f.site || !f.content_type || !f.title.trim() || (selectedType?.kind === "singleton" && (singletonCheck || Boolean(singletonExisting)))}>{submitting ? "در حال ایجاد..." : "ایجاد محتوا"}</button>
          <Link className="btn secondary" href={adminPath("/content")}>انصراف</Link></div>
      </form>
    </>
  );
}
