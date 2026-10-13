"use client";

import { FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import BlockEditor, { ContentBlock } from "@/components/BlockEditor";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string; domain: string };
type Reusable = { id: string; site: string; name: string; key: string; block: ContentBlock; updated_at: string };
type Draft = { name: string; key: string; block: ContentBlock[] };
const blank = (): Draft => ({ name: "", key: "", block: [] });

export default function ReusableBlocksPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [rows, setRows] = useState<Paginated<Reusable> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<Paginated<Site>>("/sites/?page_size=100")
      .then((response) => {
        if (!active) return;
        setSites(response.results);
        if (response.results[0]) setSite((current) => current || response.results[0].id);
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "دریافت سایت‌ها ناموفق بود"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!site) return;
    let active = true;
    setLoading(true); setError("");
    const params = new URLSearchParams({ site, page: String(page), ordering: "-updated_at" });
    if (query) params.set("search", query);
    apiFetch<Paginated<Reusable>>(`/content/reusable-blocks/?${params}`)
      .then((data) => { if (active) setRows(data); })
      .catch((cause) => { if (active) { setRows(null); setError(cause instanceof Error ? cause.message : "خطا در بارگذاری بلوک‌ها"); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [site, page, query, refresh]);

  function startCreate() { setDraft(blank()); setEditing("new"); setError(""); setSuccess(""); }
  function startEdit(item: Reusable) {
    setDraft({ name: item.name, key: item.key, block: item.block ? [item.block] : [] });
    setEditing(item.id); setError(""); setSuccess("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError(""); setSuccess("");
    if (!site || !draft.name.trim() || !/^[a-z0-9_-]+$/.test(draft.key)) {
      setError("سایت، نام و شناسه لاتین معتبر الزامی است."); return;
    }
    if (draft.block.length !== 1 || !draft.block[0].type || !draft.block[0].data) {
      setError("برای قالب آماده دقیقاً یک بلوک معتبر تعریف کنید."); return;
    }
    setSaving(true);
    try {
      await apiFetch(editing === "new" ? "/content/reusable-blocks/" : `/content/reusable-blocks/${editing}/`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: JSON.stringify({ site, name: draft.name.trim(), key: draft.key.trim(), block: draft.block[0] }),
      });
      setEditing(null);
      setSuccess("بلوک آماده ذخیره شد و در ویرایشگر پیشرفته قابل درج است.");
      setPage(1); setRefresh((n) => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیره بلوک ناموفق بود"); }
    finally { setSaving(false); }
  }

  return <>
    <PageHeader title="بلوک‌های آماده" description="ساخت و استفاده مجدد از CTA، پرسش‌وپاسخ، تصویر و سایر بلوک‌های محتوایی"
      action={<button type="button" className="btn" disabled={!site} onClick={startCreate}>+ بلوک جدید</button>} />
    <div className="cmsReusableNotice">بلوک‌های آماده، الگوی قابل کپی برای ویرایشگر پیشرفته هستند؛ درج آن‌ها در مقاله، یک نسخه مستقل ایجاد می‌کند و محتوای صفحات قبلی را با تغییر الگو بازنویسی نمی‌کند.</div>
    {error && <div className="error" role="alert">{error}</div>}
    {success && <div className="notice" role="status">{success}</div>}
    <section className="panel">
      <form className="cmsReusableToolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search.trim()); }}>
        <label className="field"><span>سایت</span><select value={site} onChange={(event) => { setSite(event.target.value); setEditing(null); setPage(1); }} required>
          {sites.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.domain}</option>)}</select></label>
        <label className="field"><span>جستجو</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام یا شناسه بلوک..." /></label>
        <button className="btn secondary">جستجو</button>
      </form>
      {loading ? <p role="status">در حال بارگذاری...</p> : rows?.results.length ? <div className="cmsReusableCards">
        {rows.results.map((item) => <article className="cmsReusableCard" key={item.id}>
          <div><strong>{item.name}</strong><small dir="ltr">{item.key}</small></div>
          <span>{item.block?.type || "unknown"}</span><button type="button" className="btn secondary small" onClick={() => startEdit(item)}>ویرایش الگو</button>
        </article>)}</div> : <div className="cmsReusableEmpty">بلوک آماده‌ای وجود ندارد. یک بلوک ایجاد کنید و در نوشته‌های بعدی استفاده کنید.</div>}
      <nav className="cmsReusableFooter" aria-label="صفحه‌بندی بلوک‌ها">
        <button type="button" className="btn secondary small" disabled={loading || !rows?.previous} onClick={() => setPage((n) => Math.max(1, n - 1))}>قبلی</button>
        <span>صفحه {page.toLocaleString("fa-IR")} · {rows?.count.toLocaleString("fa-IR") || "۰"} بلوک</span>
        <button type="button" className="btn secondary small" disabled={loading || !rows?.next} onClick={() => setPage((n) => n + 1)}>بعدی</button>
      </nav>
    </section>
    {editing && <section className="panel" aria-label="ویرایش بلوک آماده">
      <div className="cmsReusableDialogHead"><h2>{editing === "new" ? "ساخت الگوی جدید" : "ویرایش الگو"}</h2>
        <button type="button" className="btn secondary small" onClick={() => setEditing(null)}>بستن</button></div>
      <form className="cmsReusableEdit" onSubmit={save}>
        <div className="cmsReusableToolbar">
          <label className="field"><span>نام نمایشی</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="دکمه تماس با ما" /></label>
          <label className="field"><span>شناسه یکتا</span><input dir="ltr" required pattern="[a-z0-9_-]+" value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value.toLowerCase() })} placeholder="contact-cta" /></label>
        </div>
        <BlockEditor siteId={site} maxBlocks={1} value={draft.block} onChange={(block) => setDraft((prev) => ({ ...prev, block }))} />
        <div className="cmsReusableFooter"><button type="submit" className="btn" disabled={saving || draft.block.length !== 1}>{saving ? "در حال ذخیره..." : "ذخیره بلوک آماده"}</button></div>
      </form>
    </section>}
  </>;
}
