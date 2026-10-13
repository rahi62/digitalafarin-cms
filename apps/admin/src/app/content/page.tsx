"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";

type Site = { id: string; name: string; domain: string };
type ContentType = { id: string; site: string; name: string; slug: string };
type Entry = { id: string; title: string; path: string; content_type_slug: string; status: string; updated_at: string };
type Status = "" | "draft" | "review" | "scheduled" | "published" | "archived";

const statusNames: Record<string, string> = {
  draft: "پیش‌نویس", review: "در انتظار بررسی", scheduled: "زمان‌بندی‌شده",
  published: "منتشرشده", archived: "بایگانی‌شده",
};

function dateTime(value: string) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

export default function ContentPage() {
  const [entries, setEntries] = useState<Paginated<Entry> | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [types, setTypes] = useState<ContentType[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [site, setSite] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetSite = params.get("site") || "";
    const targetStatus = params.get("status") || "";
    const allowedStatuses = ["draft", "review", "scheduled", "published", "archived"];
    if (targetSite) setSite(targetSite);
    if (allowedStatuses.includes(targetStatus)) setStatus(targetStatus as Status);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<Paginated<Site>>("/sites/"), apiFetch<Paginated<ContentType>>("/content/types/")])
      .then(([s, t]) => { if (active) { setSites(s.results); setTypes(t.results); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "فیلترها بارگذاری نشدند"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ ordering: "-updated_at", page: String(page) });
    if (appliedQuery) params.set("search", appliedQuery);
    if (site) params.set("site", site);
    if (type) params.set("content_type", type);
    if (status) params.set("status", status);
    apiFetch<Paginated<Entry>>(`/content/entries/?${params}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setEntries(data); })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setEntries(null);
        setError(cause instanceof Error ? cause.message : "بارگذاری محتوا ناموفق بود");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, appliedQuery, site, type, status, reload]);

  const siteTypes = useMemo(() => types.filter((item) => !site || item.site === site), [types, site]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  }
  function reset() {
    setQuery(""); setAppliedQuery(""); setSite(""); setType(""); setStatus(""); setPage(1); setReload((value) => value + 1);
  }

  return <>
    <PageHeader title="مدیریت محتوا" description="جستجو و مدیریت نوشته‌ها، صفحه‌ها و نوع‌های محتوایی چند سایت"
      action={<Link href={adminPath("/content/new")} className="btn">+ محتوای جدید</Link>} />
    <div className="panel">
      <form onSubmit={search} className="contentListFilters">
        <label className="field"><span>جستجو</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="عنوان، مسیر یا خلاصه..." /></label>
        <label className="field"><span>سایت</span><select value={site} onChange={(e) => { setSite(e.target.value); setType(""); setPage(1); }}><option value="">همه سایت‌ها</option>{sites.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.domain}</option>)}</select></label>
        <label className="field"><span>نوع محتوا</span><select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">همه نوع‌ها</option>{siteTypes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>وضعیت</span><select value={status} onChange={(e) => { setStatus(e.target.value as Status); setPage(1); }}><option value="">همه وضعیت‌ها</option>{Object.entries(statusNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <div className="contentListActions"><button type="submit" className="btn">جستجو</button><button type="button" className="btn secondary" onClick={reset}>پاک‌کردن فیلترها</button></div>
      </form>
      {error && <div className="error" role="alert">{error} <button type="button" className="btn small secondary" onClick={() => setReload((n) => n + 1)}>تلاش دوباره</button></div>}
      <div className="contentListSummary" aria-live="polite">
        <strong>{entries?.count.toLocaleString("fa-IR") || "۰"}</strong> محتوا
        {loading && <span role="status">در حال بارگذاری...</span>}
      </div>
      <div className="tableWrap">
        <table className="table contentListTable">
          <thead><tr><th>عنوان</th><th>مسیر</th><th>نوع</th><th>وضعیت</th><th>آخرین تغییر</th><th>مدیریت</th></tr></thead>
          <tbody>{(entries?.results || []).map((item) => <tr key={item.id}>
            <td><Link href={adminPath(`/content/${item.id}`)} className="contentListTitle">{item.title || "بدون عنوان"}</Link></td>
            <td><code dir="ltr" className="contentListPath" title={item.path}>{item.path}</code></td>
            <td>{item.content_type_slug || "—"}</td>
            <td><span className={`badge ${item.status === "published" ? "green" : item.status === "scheduled" ? "warn" : ""}`}>{statusNames[item.status] || item.status}</span></td>
            <td>{dateTime(item.updated_at)}</td>
            <td><Link className="btn secondary small" href={adminPath(`/content/${item.id}`)}>ویرایش</Link></td>
          </tr>)}</tbody>
        </table>
        {!loading && !error && entries?.results.length === 0 && <div className="contentListEmpty">محتوایی مطابق فیلترهای انتخاب‌شده وجود ندارد.</div>}
      </div>
      <nav className="contentListPagination" aria-label="صفحه‌بندی محتوا">
        <button type="button" className="btn secondary" disabled={loading || !entries?.previous} onClick={() => setPage((n) => Math.max(1, n - 1))}>صفحه قبل</button>
        <span>صفحه {page.toLocaleString("fa-IR")}</span>
        <button type="button" className="btn secondary" disabled={loading || !entries?.next} onClick={() => setPage((n) => n + 1)}>صفحه بعد</button>
      </nav>
    </div>
  </>;
}
