"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string; domain: string };
type AuditSummary = {
  issues?: number;
  errors?: number;
  warnings?: number;
  notices?: number;
  avg_response_ms?: number;
  indexable_pages?: number;
  crawl_limit_reached?: boolean;
};
type AuditRun = {
  id: string;
  site: string;
  site_name: string;
  site_domain: string;
  status: "queued" | "running" | "done" | "failed";
  pages_crawled: number;
  max_pages: number;
  health_score: number;
  issue_count: number;
  page_count: number;
  summary: AuditSummary & Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

function statusClass(status: AuditRun["status"]) {
  if (status === "done") return "badge green";
  if (status === "failed") return "badge auditErrorBadge";
  if (status === "running") return "badge auditRunningBadge";
  return "badge";
}

export default function AuditPage() {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [maxPages, setMaxPages] = useState(100);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRuns() {
    try {
      const data = await apiFetch<Paginated<AuditRun>>("/audit/runs/?ordering=-created_at");
      setRuns(data.results);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری Auditها");
    }
  }

  useEffect(() => {
    loadRuns();
    apiFetch<Paginated<Site>>("/sites/").then((data) => {
      setSites(data.results);
      if (data.results[0]) setSite(data.results[0].id);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری سایت‌ها"));
  }, []);

  const hasActiveRun = runs.some((run) => run.status === "queued" || run.status === "running");
  useEffect(() => {
    if (!hasActiveRun) return;
    const timer = window.setInterval(loadRuns, 4000);
    return () => window.clearInterval(timer);
  }, [hasActiveRun]);

  const latest = useMemo(
    () => runs.find((run) => !site || run.site === site) || runs[0] || null,
    [runs, site],
  );

  async function startAudit() {
    if (!site) return setMessage("یک سایت انتخاب کنید");
    if (maxPages < 1 || maxPages > 500) return setMessage("حداکثر صفحات باید بین ۱ تا ۵۰۰ باشد");
    setStarting(true);
    setMessage("");
    try {
      const run = await apiFetch<AuditRun>("/audit/runs/start/", {
        method: "POST",
        body: JSON.stringify({ site, max_pages: maxPages }),
      });
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setMessage("Audit در صف اجرا قرار گرفت");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "شروع Audit ناموفق بود");
    } finally {
      setStarting(false);
    }
  }

  async function rerun(run: AuditRun) {
    setMessage("");
    try {
      await apiFetch(`/audit/runs/${run.id}/rerun/`, { method: "POST", body: "{}" });
      setMessage("Audit دوباره در صف قرار گرفت");
      await loadRuns();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "اجرای مجدد ناموفق بود");
    }
  }

  return (
    <>
      <PageHeader
        title="SEO Audit"
        description="Crawler فنی، Link Graph، Indexability و Quality Checks برای سایت‌های متصل"
        action={
          <div className="auditStartControls">
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              {sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}
            </select>
            <label><span>Max pages</span><input type="number" min={1} max={500} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} /></label>
            <button className="btn" type="button" disabled={starting || !site} onClick={startAudit}>{starting ? "در حال ایجاد..." : "شروع Audit"}</button>
          </div>
        }
      />

      {message && <div className={message.includes("ناموفق") || message.includes("خطا") || message.includes("بین") ? "error" : "notice"}>{message}</div>}

      {latest && (
        <div className="auditHeroGrid">
          <div className={`auditScoreCard score-${latest.health_score >= 80 ? "good" : latest.health_score >= 50 ? "medium" : "bad"}`}>
            <span>Health Score</span><strong>{latest.health_score}</strong><small>/100</small>
          </div>
          <div className="auditMetricCard"><span>Pages crawled</span><strong>{latest.pages_crawled}</strong><small>از سقف {latest.max_pages}</small></div>
          <div className="auditMetricCard error"><span>Errors</span><strong>{latest.summary?.errors || 0}</strong><small>نیازمند رسیدگی</small></div>
          <div className="auditMetricCard warning"><span>Warnings</span><strong>{latest.summary?.warnings || 0}</strong><small>{latest.summary?.notices || 0} notice</small></div>
          <div className="auditMetricCard"><span>Avg response</span><strong>{latest.summary?.avg_response_ms || 0}</strong><small>ms</small></div>
        </div>
      )}

      <section className="panel auditRunsPanel">
        <div className="auditSectionHeader">
          <div><h2>Audit Runs</h2><p>تاریخچه crawlها و تغییر Health Score.</p></div>
          <button type="button" className="btn secondary small" onClick={loadRuns}>↻ بروزرسانی</button>
        </div>
        <div className="tableWrap">
          <table className="table auditRunsTable">
            <thead><tr><th>سایت</th><th>وضعیت</th><th>Score</th><th>Pages</th><th>Issues</th><th>Response</th><th>شروع</th><th></th></tr></thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td><strong>{run.site_name}</strong><small>{run.site_domain}</small></td>
                  <td><span className={statusClass(run.status)}>{run.status}</span></td>
                  <td><strong className={`scoreText ${run.health_score >= 80 ? "good" : run.health_score >= 50 ? "medium" : "bad"}`}>{run.health_score}</strong></td>
                  <td>{run.pages_crawled}<small> / {run.max_pages}</small></td>
                  <td>{run.issue_count}<small>{run.summary?.errors ? ` · ${run.summary.errors} error` : ""}</small></td>
                  <td>{run.summary?.avg_response_ms || 0} ms</td>
                  <td>{formatDate(run.started_at || run.created_at)}</td>
                  <td><div className="auditRowActions"><Link className="btn secondary small" href={`/audit/${run.id}`}>جزئیات</Link><button type="button" className="textButton" disabled={run.status === "running"} onClick={() => rerun(run)}>Rerun</button></div></td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={8}><div className="emptyState">هنوز Audit اجرا نشده است.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
