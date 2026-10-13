"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";

type Entry = {
  id: string;
  title: string;
  path: string;
  content_type_slug: string;
  deleted_at: string;
  status: string;
  site: string;
};

type Site = { id: string; name: string; domain: string };

export default function TrashPage() {
  const [rows, setRows] = useState<Paginated<Entry> | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<Paginated<Site>>("/sites/?page_size=100")
      .then((result) => { if (active) setSites(result.results); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "دریافت سایت‌ها ناموفق بود"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (site) params.set("site", site);
    apiFetch<Paginated<Entry>>(`/content/entries/trashed/?${params}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setRows(result);
          setError("");
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setRows(null);
          setError(cause instanceof Error ? cause.message : "فهرست سطل زباله دریافت نشد");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [site, page, refresh]);

  const siteLabels = useMemo(() => Object.fromEntries(sites.map((item) => [item.id, item.name])), [sites]);
  async function restore(entry: Entry) {
    if (!window.confirm(`«${entry.title}» به‌صورت پیش‌نویس بازیابی شود؟ این عمل صفحه را به‌طور خودکار منتشر نمی‌کند.`)) return;
    setBusyId(entry.id);
    setError(""); setNotice("");
    try {
      await apiFetch(`/content/entries/${entry.id}/restore/`, { method: "POST", body: "{}" });
      setNotice(`«${entry.title}» به‌صورت پیش‌نویس بازیابی شد.`);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "بازیابی ناموفق بود؛ احتمال تعارض مسیر وجود دارد");
    } finally { setBusyId(""); }
  }

  function fmt(value: string) {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    } catch { return value; }
  }

  return <>
    <PageHeader title="سطل زباله محتوا" description="بازیابی ایمن نوشته‌ها و صفحات حذف‌شده، بدون حذف دائمی اطلاعات"
      action={<Link href={adminPath("/content")} className="btn secondary">بازگشت به محتوا</Link>} />
    <div className="cmsTrashNotice">
      محتواهای حذف‌شده از سایت و فهرست معمول مدیریت خارج می‌شوند. آدرس و رکورد آن‌ها محفوظ می‌ماند. بازیابی، آن‌ها را فقط به پیش‌نویس برمی‌گرداند و انتشار مجدد جداگانه انجام می‌شود.
    </div>
    {error && <div className="error" role="alert">{error} <button className="btn secondary small" onClick={() => setRefresh((value) => value + 1)} type="button">تلاش دوباره</button></div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <div className="panel">
      <div className="cmsTrashTop">
        <label className="field"><span>فیلتر سایت</span><select value={site} onChange={(event) => { setSite(event.target.value); setPage(1); }}>
          <option value="">همه سایت‌ها</option>
          {sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}
        </select></label>
        <span>{rows?.count.toLocaleString("fa-IR") || "۰"} مورد در سطل زباله</span>
      </div>
      {loading ? <div role="status" className="cmsTrashEmpty">در حال دریافت محتوا...</div> :
        rows?.results.length ? <div className="tableWrap">
          <table className="table cmsTrashTable">
            <thead><tr><th>محتوا</th><th>سایت</th><th>آدرس محفوظ</th><th>تاریخ حذف</th><th>عملیات</th></tr></thead>
            <tbody>{rows.results.map((entry) => <tr key={entry.id}>
              <td><strong>{entry.title || "بدون عنوان"}</strong><small>{entry.content_type_slug}</small></td>
              <td>{siteLabels[entry.site] || "—"}</td>
              <td><code dir="ltr">{entry.path}</code></td>
              <td>{fmt(entry.deleted_at)}</td>
              <td><button type="button" className="btn secondary small" disabled={Boolean(busyId)}
                onClick={() => restore(entry)}>{busyId === entry.id ? "در حال بازیابی..." : "بازیابی پیش‌نویس"}</button></td>
            </tr>)}</tbody>
          </table>
        </div> : <div className="cmsTrashEmpty">موردی در سطل زباله این سایت وجود ندارد.</div>}
      <nav className="contentListPagination" aria-label="صفحه‌بندی سطل زباله">
        <button type="button" className="btn secondary" disabled={!rows?.previous || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>صفحه قبل</button>
        <span>صفحه {page.toLocaleString("fa-IR")}</span>
        <button type="button" className="btn secondary" disabled={!rows?.next || loading} onClick={() => setPage((value) => value + 1)}>صفحه بعد</button>
      </nav>
    </div>
  </>;
}
