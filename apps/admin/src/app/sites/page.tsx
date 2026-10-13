"use client";

import { FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";
import Link from "next/link";

type Organization = { id: string; name: string; slug: string };
type Site = { id: string; organization: string; organization_name?: string; name: string; domain: string; default_language: string; timezone: string; is_active: boolean };
type SiteForm = { organization: string; name: string; domain: string; default_language: string; timezone: string; is_active: boolean };
const empty: SiteForm = { organization: "", name: "", domain: "", default_language: "fa", timezone: "Asia/Tehran", is_active: true };

export default function SitesPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [sites, setSites] = useState<Paginated<Site> | null>(null);
  const [filterOrg, setFilterOrg] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<SiteForm>(empty);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<Paginated<Organization>>("/organizations/?page_size=100").then((data) => {
      if (active) setOrganizations(data.results);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "خطا در دریافت سازمان‌ها"); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filterOrg) query.set("organization", filterOrg);
    apiFetch<Paginated<Site>>(`/sites/?${query}`).then((data) => { if (active) setSites(data); })
      .catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "بارگذاری سایت‌ها ناموفق بود"); setSites(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, filterOrg, refresh]);

  function newSite() {
    setEditing("new");
    setError(""); setSuccess("");
    setForm({ ...empty, organization: filterOrg || organizations[0]?.id || "" });
  }

  function editSite(site: Site) {
    setEditing(site.id); setError(""); setSuccess("");
    setForm({ organization: site.organization, name: site.name, domain: site.domain, default_language: site.default_language, timezone: site.timezone, is_active: site.is_active });
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    if (!form.organization || !form.name.trim() || !form.domain.trim()) { setError("سازمان، نام و دامنه الزامی هستند."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const payload = { ...form, name: form.name.trim(), domain: form.domain.trim().toLowerCase() };
      await apiFetch(editing === "new" ? "/sites/" : `/sites/${editing}/`, {
        method: editing === "new" ? "POST" : "PATCH", body: JSON.stringify(payload),
      });
      setEditing(null);
      setSuccess(editing === "new" ? "سایت با موفقیت ساخته شد." : "تنظیمات سایت ذخیره شد.");
      setRefresh((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ذخیره سایت ناموفق بود");
    } finally { setBusy(false); }
  }

  async function addOrganization(event: FormEvent) {
    event.preventDefault();
    setError(""); setSuccess(""); setBusy(true);
    try {
      const saved = await apiFetch<Organization>("/organizations/", {
        method: "POST", body: JSON.stringify({ name: organizationName.trim(), slug: organizationSlug.trim().toLowerCase(), is_active: true }),
      });
      setOrganizationName(""); setOrganizationSlug("");
      setSuccess("سازمان ساخته شد. اکنون می‌توانید اولین سایت آن را ایجاد کنید.");
      setForm({ ...empty, organization: saved.id });
      setEditing("new");
      setRefresh((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ایجاد سازمان ناموفق بود");
    } finally { setBusy(false); }
  }

  return <>
    <PageHeader title="مدیریت سایت‌ها" description="دامنه‌ها، زبان، منطقه زمانی و سازمان‌های متصل به CMS"
      action={<button className="btn" type="button" onClick={newSite}>+ سایت جدید</button>} />
    {error && <div className="error" role="alert">{error}</div>}
    {success && <div className="notice" role="status">{success}</div>}
    <div className="cmsSitesGrid">
      <section className="panel cmsSitesList">
        <div className="cmsSitesBar"><label>فیلتر سازمان
          <select aria-label="فیلتر سازمان" value={filterOrg} onChange={(event) => { setFilterOrg(event.target.value); setPage(1); }}>
            <option value="">همه سازمان‌های مجاز</option>
            {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select></label><span>{sites?.count.toLocaleString("fa-IR") || "۰"} سایت</span></div>
        {loading ? <div className="cmsSitesEmpty" role="status">در حال دریافت سایت‌ها...</div>
          : sites?.results.length ? <div className="cmsSiteCards">{sites.results.map((site) => <article className="cmsSiteCard" key={site.id}>
              <div className="cmsSiteCardHead"><div><h2>{site.name}</h2><code dir="ltr">{site.domain}</code></div>
                <span className={`cmsSiteState ${site.is_active ? "isActive" : ""}`}>{site.is_active ? "فعال" : "غیرفعال"}</span></div>
              <div className="cmsSiteDetails"><span>سازمان: {site.organization_name || organizations.find((item) => item.id === site.organization)?.name || "—"}</span>
                <span>زبان: {site.default_language || "—"}</span><span>منطقه زمانی: {site.timezone || "—"}</span></div>
              <div className="cmsSiteCardActions"><button type="button" className="btn secondary small" onClick={() => editSite(site)}>ویرایش سایت</button>
                <Link className="btn secondary small" href={adminPath("/settings")}>تنظیمات CMS و سئو</Link></div>
            </article>)}</div>
          : <div className="cmsSitesEmpty">سایتی پیدا نشد. با ساخت سایت جدید شروع کنید.</div>}
        <nav className="cmsSitePagination" aria-label="صفحه‌بندی سایت‌ها">
          <button type="button" className="btn secondary small" disabled={loading || !sites?.previous} onClick={() => setPage((n) => Math.max(1, n - 1))}>قبلی</button>
          <span>صفحه {page.toLocaleString("fa-IR")}</span>
          <button type="button" className="btn secondary small" disabled={loading || !sites?.next} onClick={() => setPage((n) => n + 1)}>بعدی</button>
        </nav>
      </section>
      <aside className="cmsSitesAside">
        {editing && <section className="panel">
          <div className="cmsSitesSectionTitle"><h2>{editing === "new" ? "سایت جدید" : "ویرایش سایت"}</h2><button type="button" className="btn secondary small" onClick={() => setEditing(null)}>بستن</button></div>
          <form className="cmsSitesForm" onSubmit={saveSite}>
            <div className="field"><label htmlFor="site-organization">سازمان</label><select id="site-organization" required value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })}>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
            <div className="field"><label htmlFor="site-name">نام سایت</label><input id="site-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="site-domain">دامنه</label><input id="site-domain" dir="ltr" required placeholder="example.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></div>
            <div className="cmsSiteFieldsRow">
              <div className="field"><label htmlFor="site-lang">زبان پیش‌فرض</label><input id="site-lang" dir="ltr" value={form.default_language} onChange={(e) => setForm({ ...form, default_language: e.target.value })} /></div>
              <div className="field"><label htmlFor="site-timezone">منطقه زمانی</label><input id="site-timezone" dir="ltr" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
            </div>
            <label className="cmsSiteActive"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> سایت فعال باشد</label>
            <small>غیرفعال‌کردن سایت ممکن است دسترسی عمومی به محتوای آن را متوقف کند. این گزینه داده‌های سایت را حذف نمی‌کند.</small>
            <button className="btn" disabled={busy}>{busy ? "در حال ذخیره..." : "ذخیره سایت"}</button>
          </form>
        </section>}
        <section className="panel">
          <h2>سازمان جدید</h2><p className="cmsSitesHint">سازمان برای تفکیک دسترسی کاربران و سایت‌ها استفاده می‌شود.</p>
          <form className="cmsSitesForm" onSubmit={addOrganization}>
            <div className="field"><label htmlFor="org-name">نام سازمان</label><input id="org-name" required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} /></div>
            <div className="field"><label htmlFor="org-slug">شناسه سازمان</label><input id="org-slug" dir="ltr" pattern="[a-z0-9_-]+" required placeholder="my-agency" value={organizationSlug} onChange={(e) => setOrganizationSlug(e.target.value)} /></div>
            <button className="btn secondary" disabled={busy}>ساخت سازمان</button>
          </form>
        </section>
      </aside>
    </div>
  </>;
}
