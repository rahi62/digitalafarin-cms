"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { adminPath } from "@/lib/admin-path";
import { getAccessToken } from "@/lib/api";

type RouteItem = {
  url: string;
  file: string;
  kind: "page" | "route";
  route_kind: string;
  loader: string;
  reserved: boolean;
  parallel: boolean;
  intercepted: boolean;
  groups: string[];
};
type Mapping = { route: string; file: string; source: "cms" | "host"; mode: "page" | "detail" | "collection"; content_type: string | null };
type Report = { version: number; generated_at: string; routes: RouteItem[]; mappings: Mapping[]; errors: string[]; warnings: string[]; mapped: boolean };
type ViewMode = "all" | "unmapped" | "cms" | "host" | "protected";

function commandFor(route: RouteItem, mode: string, contentType: string, source: "cms" | "host") {
  const safeRoute = route.url.replaceAll('"', '\\"');
  const cmsType = source === "cms" ? ` --content-type ${contentType.replace(/[^a-zA-Z0-9_-]/g, "")}` : "";
  return `npx @digitalafarin/cms-cli map-route --frontend . --route "${safeRoute}" --mode ${mode} --source ${source}${cmsType}`;
}
function formatDate(value: string) {
  try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value || "نامشخص"; }
}

export default function RouteExplorerPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [contentType, setContentType] = useState("post");
  const [source, setSource] = useState<"cms" | "host">("cms");
  const [mode, setMode] = useState<"page" | "collection" | "detail">("page");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const token = getAccessToken();
    if (!token) { setLoading(false); setError("برای مشاهده گزارش ابتدا وارد پنل شوید."); return; }
    try {
      const res = await fetch(adminPath("/route-explorer/report"), {
        headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      setReport(body as Report);
    } catch (cause) {
      if (signal?.aborted) return;
      setReport(null);
      setError(cause instanceof Error ? cause.message : "دریافت گزارش ناموفق بود");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const mappedByRoute = useMemo(() => new Map((report?.mappings || []).map((item) => [item.route, item])), [report]);
  const visible = useMemo(() => (report?.routes || []).filter((route) => {
    const mapping = mappedByRoute.get(route.url);
    const status = route.reserved || route.kind === "route" ? "protected" : mapping?.source || "unmapped";
    const matches = view === "all" || view === status;
    return matches && (!query.trim() || `${route.url} ${route.file} ${mapping?.content_type || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  }), [report, mappedByRoute, query, view]);

  const cmsCount = report?.mappings.filter((item) => item.source === "cms").length || 0;
  const unmappedCount = report?.routes.filter((route) => route.kind === "page" && !route.reserved && !mappedByRoute.has(route.url)).length || 0;
  const selectedRoute = report?.routes.find((route) => route.url === selected && route.kind === "page");
  const canMap = selectedRoute && !selectedRoute.reserved && !selectedRoute.parallel && !selectedRoute.intercepted;
  const modeAllowed = selectedRoute && (mode === "detail" ? selectedRoute.route_kind !== "static" : mode === "collection" ? selectedRoute.route_kind === "static" : true);

  async function copyCommand() {
    if (!selectedRoute || !canMap) return;
    try {
      await navigator.clipboard.writeText(commandFor(selectedRoute, mode, contentType, source));
      setCopied(true);
    } catch { setCopied(false); setError("مرورگر اجازه کپی نداد. دستور را از بخش زیر به‌صورت دستی کپی کنید."); }
  }

  return <>
    <PageHeader title="کاوشگر مسیرها" description="شناسایی مسیرهای Next.js، مالکیت صفحات و وضعیت اتصال به CMS" />
    <div className="routeExplorerNotice">
      این گزارش یک تصویر ثابت از سورس وب‌اپلیکیشن است، نه اسکن زنده یا اثبات اتصال Django. ثبت نگاشت و انتشار محتوا فقط پس از بررسی و تست روی میزبان انجام شود.
    </div>
    {loading && <div className="panel" role="status">در حال دریافت گزارش مسیرها...</div>}
    {error && <div className="error" role="alert">{error}</div>}
    {!loading && !report && <div className="panel">
      <h2>برای نمایش مسیرها ابتدا گزارش تهیه کنید</h2>
      <p>در ریشه پروژه میزبان، نسخه توسعه CLI را اجرا کنید و فایل خروجی را در مسیر قابل دسترس سرور CMS نگه دارید.</p>
      <code dir="ltr">digitalafarin-cms routes --frontend . --export-report</code>
      <p>اگر ادمین جداگانه مستقر شده، مسیر فایل را با متغیر سروری <code>DIGITALAFARIN_CMS_ROUTE_REPORT_PATH</code> تنظیم کنید.</p>
      <button type="button" className="btn secondary" onClick={() => void load()}>بررسی مجدد</button>
    </div>}
    {report && <>
      <div className="routeExplorerStats">
        <div className="panel"><small>کل مسیرها</small><strong>{report.routes.length.toLocaleString("fa-IR")}</strong></div>
        <div className="panel"><small>نگاشت به CMS</small><strong>{cmsCount.toLocaleString("fa-IR")}</strong></div>
        <div className="panel"><small>صفحات بدون نگاشت</small><strong>{unmappedCount.toLocaleString("fa-IR")}</strong></div>
        <div className="panel"><small>خطاها و هشدارها</small><strong>{(report.errors.length + report.warnings.length).toLocaleString("fa-IR")}</strong></div>
      </div>
      <div className="routeExplorerMeta">
        <span>زمان تولید گزارش: {formatDate(report.generated_at)}</span>
        <button type="button" className="btn secondary small" onClick={() => void load()}>خواندن مجدد فایل گزارش</button>
      </div>
      {(report.errors.length > 0 || report.warnings.length > 0) && <section className="panel" aria-label="نتیجه اعتبارسنجی مسیرها">
        <h2>موارد نیازمند بررسی</h2>
        {report.errors.map((issue, index) => <p key={`error-${index}`} className="routeExplorerIssue error">{issue}</p>)}
        {report.warnings.map((issue, index) => <p key={`warn-${index}`} className="routeExplorerIssue routeExplorerWarning">{issue}</p>)}
      </section>}
      <section className="panel">
        <div className="routeExplorerToolbar">
          <input aria-label="جستجوی مسیر" placeholder="جستجوی آدرس، فایل یا نوع محتوا..." value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="فیلتر وضعیت" value={view} onChange={(event) => setView(event.target.value as ViewMode)}>
            <option value="all">همه مسیرها</option><option value="unmapped">بدون نگاشت</option>
            <option value="cms">متصل به CMS</option><option value="host">متعلق به میزبان</option>
            <option value="protected">زیرساخت / API</option>
          </select>
        </div>
        <div className="tableWrap">
          <table className="table routeExplorerTable"><thead><tr><th>آدرس</th><th>نوع</th><th>مالکیت</th><th>فایل منبع</th><th>اقدام</th></tr></thead>
            <tbody>{visible.map((route) => {
              const mapping = mappedByRoute.get(route.url);
              const protectedRoute = route.reserved || route.kind === "route";
              return <tr key={route.file}>
                <td dir="ltr"><code>{route.url}</code></td>
                <td>{route.kind === "route" ? "API" : route.route_kind}</td>
                <td>{protectedRoute ? "زیرساخت" : mapping?.source === "cms" ? `CMS · ${mapping.content_type}` : mapping?.source === "host" ? "میزبان" : "تعیین‌نشده"}</td>
                <td><span className="routeExplorerFile" dir="ltr" title={route.file}>{route.file}</span></td>
                <td><button type="button" className="btn secondary small" disabled={protectedRoute || route.parallel || route.intercepted} onClick={() => { const current = mappedByRoute.get(route.url); setSelected(route.url); setSource(current?.source || "cms"); setMode(current?.mode || (route.loader === "cms-collection" ? "collection" : route.route_kind === "static" ? "page" : "detail")); setContentType(current?.content_type || "post"); setCopied(false); }}>بررسی نگاشت</button></td>
              </tr>;
            })}</tbody>
          </table>
          {visible.length === 0 && <p className="routeExplorerEmpty">مسیری مطابق جستجو پیدا نشد.</p>}
        </div>
      </section>
      {selectedRoute && <section className="panel routeExplorerMapping" aria-label="تنظیم نگاشت مسیر">
        <div className="routeExplorerMappingHeader"><h2>بررسی نگاشت <code dir="ltr">{selectedRoute.url}</code></h2><button className="btn secondary small" onClick={() => setSelected(null)}>بستن</button></div>
        <p>منبع: <code dir="ltr">{selectedRoute.file}</code></p>
        <p>وضعیت Loader: <strong>{selectedRoute.loader}</strong> — با بررسی استاتیک تعیین شده است.</p>
        <div className="routeExplorerMappingControls"><div className="field"><label htmlFor="route-owner">مالکیت</label><select id="route-owner" value={source} onChange={(event) => { setSource(event.target.value as "cms" | "host"); setCopied(false); }}><option value="cms">CMS</option><option value="host">سایت میزبان</option></select></div>
        <div className="field"><label htmlFor="route-mode">نوع نگاشت</label><select id="route-mode" value={mode} onChange={(event) => { setMode(event.target.value as "page" | "collection" | "detail"); setCopied(false); }}><option value="page">صفحه</option>{selectedRoute.route_kind === "static" && <option value="collection">فهرست محتوا</option>}{selectedRoute.route_kind !== "static" && <option value="detail">جزئیات محتوا</option>}</select></div>
        {source === "cms" && <div className="field"><label htmlFor="route-content-type">نوع محتوا در Django</label>
          <input id="route-content-type" value={contentType} onChange={(event) => { setContentType(event.target.value); setCopied(false); }} dir="ltr" />
        </div>}</div>
        <p>نوع نگاشت انتخاب‌شده: <code dir="ltr">{mode}</code></p>
        <pre dir="ltr" className="routeExplorerCommand">{commandFor(selectedRoute, mode, contentType, source)}</pre>
        {selectedRoute.route_kind === "static" && <Link className="btn secondary" href={adminPath(`/component-registry?route=${encodeURIComponent(selectedRoute.url)}`)}>اتصال بصری کامپوننت‌های این صفحه</Link>}
        <button type="button" className="btn" disabled={!canMap || !modeAllowed || (source === "cms" && !/^[a-zA-Z0-9_-]+$/.test(contentType))} onClick={copyCommand}>{copied ? "دستور کپی شد" : "کپی دستور نگاشت"}</button>
        <p className="muted">این دکمه فایلی را ویرایش نمی‌کند؛ اجرای دستور، بازبینی Loader و تأیید عملکرد در staging ضروری است.</p>
      </section>}
    </>}
  </>;
}
