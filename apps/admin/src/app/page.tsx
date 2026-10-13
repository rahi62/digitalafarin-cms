"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";

type Site = { id: string; name: string; domain: string };
type Entry = { id: string; title: string; path: string; status: string; content_type_slug: string; updated_at: string; site: string };
type Summary = { total: number; draft: number; review: number; scheduled: number; published: number; recent: Entry[] };
const blank: Summary = { total: 0, draft: 0, review: 0, scheduled: 0, published: 0, recent: [] };
const statusNames: Record<string, string> = { draft: "پیش‌نویس", review: "نیازمند بررسی", scheduled: "زمان‌بندی‌شده", published: "منتشرشده", archived: "بایگانی‌شده" };

function dateLabel(value: string) {
  try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
  catch { return "—"; }
}

export default function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [summary, setSummary] = useState<Summary>(blank);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    apiFetch<Paginated<Site>>("/sites/?page_size=100").then((response) => {
      if (active) setSites(response.results);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "بارگذاری سایت‌ها ناموفق بود"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ ordering: "-updated_at", page_size: "7" });
    if (site) params.set("site", site);
    const prefix = "/content/entries/?";
    const statuses = ["draft", "review", "scheduled", "published"] as const;
    Promise.all([
      apiFetch<Paginated<Entry>>(prefix + params),
      ...statuses.map((status) => apiFetch<Paginated<Entry>>(prefix + new URLSearchParams({ ...Object.fromEntries(params), page_size: "1", status }))),
    ]).then(([recent, draft, review, scheduled, published]) => {
      if (active) setSummary({ total: recent.count, draft: draft.count, review: review.count, scheduled: scheduled.count, published: published.count, recent: recent.results });
    }).catch((cause) => {
      if (active) { setSummary(blank); setError(cause instanceof Error ? cause.message : "دریافت آمار ناموفق بود"); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [site, refresh]);

  const activeSite = useMemo(() => sites.find((item) => item.id === site), [site, sites]);
  const filter = site ? `?site=${encodeURIComponent(site)}` : "";
  const shortcuts = [
    { label: "محتوای جدید", description: "ایجاد صفحه یا مقاله", href: "/content/new", icon: "✎" },
    { label: "مدیریت محتوا", description: "پیش‌نویس‌ها و نوشته‌ها", href: "/content", icon: "▤" },
    { label: "رسانه", description: "آپلود و مدیریت فایل", href: "/media", icon: "▧" },
    { label: "ساختار محتوا", description: "تعریف فیلدهای اختصاصی", href: "/content-types", icon: "◇" },
    { label: "منوها", description: "ساخت منوهای سایت", href: "/menus", icon: "☰" },
    { label: "کاوشگر مسیرها", description: "بررسی اتصال صفحات", href: "/route-explorer", icon: "↗" },
  ];

  return <>
    <PageHeader title="داشبورد مدیریت محتوا" description="وضعیت انتشار، کارهای روزانه و دسترسی سریع به بخش‌های اصلی"
      action={<Link href={adminPath("/content/new")} className="btn">+ محتوای جدید</Link>} />
    <section className="cmsDashboardTop">
      <label className="cmsDashboardSite"><span>سایت فعال</span><select aria-label="انتخاب سایت داشبورد" value={site} onChange={(event) => setSite(event.target.value)}>
        <option value="">تمام سایت‌های مجاز</option>
        {sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}
      </select></label>
      {activeSite && <span className="cmsDashboardDomain" dir="ltr">{activeSite.domain}</span>}
      <button type="button" className="btn secondary small" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>به‌روزرسانی</button>
    </section>
    {error && <div className="error" role="alert">{error} <button className="btn small secondary" onClick={() => setRefresh((n) => n + 1)}>تلاش دوباره</button></div>}
    <section className="cmsDashboardStats" aria-label="آمار انتشار">
      {([
        ["همه محتوا", summary.total, "", "/content"],
        ["پیش‌نویس", summary.draft, "draft", "/content"],
        ["در انتظار بررسی", summary.review, "review", "/content"],
        ["انتشار زمان‌بندی‌شده", summary.scheduled, "scheduled", "/content"],
        ["منتشرشده", summary.published, "published", "/content"],
      ] as const).map(([name, value, status, url]) => <Link key={name}
        href={adminPath(url) + (site || status ? `?${new URLSearchParams({ ...(site ? { site } : {}), ...(status ? { status } : {}) })}` : "")}
        className="cmsDashboardMetric" aria-label={`${name}: ${loading ? "در حال بارگذاری" : value.toLocaleString("fa-IR")}`}>
        <span>{name}</span><strong>{loading ? "…" : value.toLocaleString("fa-IR")}</strong><small>مشاهده و مدیریت ←</small>
      </Link>)}
    </section>
    <section className="panel">
      <div className="cmsDashboardSectionTitle"><div><h2>دسترسی سریع</h2><p>ابزارهای پرکاربرد در یک نگاه</p></div></div>
      <div className="cmsDashboardShortcuts">{shortcuts.map(({ label, description, href, icon }) => <Link key={href} href={adminPath(href)}
        className="cmsDashboardShortcut"><span aria-hidden="true">{icon}</span><strong>{label}</strong><small>{description}</small></Link>)}</div>
    </section>
    <section className="panel">
      <div className="cmsDashboardSectionTitle"><div><h2>آخرین محتواهای ویرایش‌شده</h2><p>برای ادامه ویرایش، عنوان محتوا را انتخاب کنید.</p></div>
        <Link href={adminPath("/content") + filter} className="btn secondary small">همه محتواها</Link></div>
      {loading ? <p className="cmsDashboardEmpty" role="status">در حال بارگذاری محتوا...</p>
        : summary.recent.length === 0 ? <div className="cmsDashboardEmpty"><strong>هنوز محتوایی وجود ندارد</strong>
          <p>با ایجاد اولین صفحه یا مقاله شروع کنید.</p><Link href={adminPath("/content/new")} className="btn">ایجاد محتوا</Link></div>
        : <div className="tableWrap"><table className="table">
          <thead><tr><th>عنوان</th><th>مسیر</th><th>نوع</th><th>وضعیت</th><th>آخرین تغییر</th></tr></thead>
          <tbody>{summary.recent.map((entry) => <tr key={entry.id}>
            <td><Link className="cmsDashboardEntry" href={adminPath(`/content/${entry.id}`)}>{entry.title || "بدون عنوان"}</Link></td>
            <td dir="ltr"><code>{entry.path}</code></td><td>{entry.content_type_slug}</td>
            <td><span className={`badge ${entry.status === "published" ? "green" : entry.status === "scheduled" ? "warn" : ""}`}>{statusNames[entry.status] || entry.status}</span></td>
            <td>{dateLabel(entry.updated_at)}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </>;
}
