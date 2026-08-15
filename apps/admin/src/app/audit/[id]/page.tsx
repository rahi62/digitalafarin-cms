"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type RunSummary = {
  issues?: number; errors?: number; warnings?: number; notices?: number;
  issue_codes?: Record<string, number>; status_codes?: Record<string, number>;
  html_pages?: number; indexable_pages?: number; avg_response_ms?: number;
  crawl_limit_reached?: boolean; base_url?: string; error?: string;
};
type AuditRun = {
  id: string; site_name: string; site_domain: string; status: string;
  pages_crawled: number; max_pages: number; health_score: number; issue_count: number;
  summary: RunSummary; created_at: string; started_at: string | null; finished_at: string | null;
};
type AuditPage = {
  id: string; url: string; final_url: string; path: string; status_code: number; content_type: string;
  response_ms: number; title: string; meta_description: string; canonical_url: string; robots: string;
  is_indexable: boolean; h1_count: number; h2_count: number; word_count: number;
  image_count: number; missing_alt_count: number; internal_links: number; external_links: number;
  incoming_internal_links: number; issue_count: number;
};
type AuditIssue = {
  id: string; page: string | null; page_path: string | null; url: string; code: string;
  severity: "error" | "warning" | "notice"; title: string; details: Record<string, unknown>;
  is_resolved: boolean;
};

type Tab = "issues" | "pages";

function formatDate(value: string | null) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

function severityBadge(severity: AuditIssue["severity"]) {
  return `badge auditSeverity ${severity}`;
}

function pageStatusClass(code: number) {
  if (code >= 500 || code === 0) return "httpStatus serverError";
  if (code >= 400) return "httpStatus clientError";
  if (code >= 300) return "httpStatus redirect";
  if (code >= 200) return "httpStatus success";
  return "httpStatus";
}

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<AuditRun | null>(null);
  const [tab, setTab] = useState<Tab>("issues");
  const [pages, setPages] = useState<Paginated<AuditPage> | null>(null);
  const [issues, setIssues] = useState<Paginated<AuditIssue> | null>(null);
  const [pagePage, setPagePage] = useState(1);
  const [issuePage, setIssuePage] = useState(1);
  const [pageSearch, setPageSearch] = useState("");
  const [indexability, setIndexability] = useState("");
  const [pageOrdering, setPageOrdering] = useState("-issue_count");
  const [severity, setSeverity] = useState("");
  const [issueCode, setIssueCode] = useState("");
  const [resolved, setResolved] = useState("false");
  const [message, setMessage] = useState("");

  async function loadRun() {
    try {
      const data = await apiFetch<AuditRun>(`/audit/runs/${id}/`);
      setRun(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری Audit");
    }
  }

  async function loadPages(targetPage = pagePage) {
    const qs = new URLSearchParams({ run: id, page: String(targetPage), ordering: pageOrdering });
    if (pageSearch.trim()) qs.set("search", pageSearch.trim());
    if (indexability) qs.set("is_indexable", indexability);
    try {
      setPages(await apiFetch<Paginated<AuditPage>>(`/audit/pages/?${qs.toString()}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری صفحات Audit");
    }
  }

  async function loadIssues(targetPage = issuePage) {
    const qs = new URLSearchParams({ run: id, page: String(targetPage), ordering: "severity,code,url" });
    if (severity) qs.set("severity", severity);
    if (issueCode) qs.set("code", issueCode);
    if (resolved) qs.set("is_resolved", resolved);
    try {
      setIssues(await apiFetch<Paginated<AuditIssue>>(`/audit/issues/?${qs.toString()}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری Issueها");
    }
  }

  useEffect(() => { loadRun(); }, [id]);
  useEffect(() => { loadPages(pagePage); }, [id, pagePage, pageOrdering, indexability]);
  useEffect(() => { loadIssues(issuePage); }, [id, issuePage, severity, issueCode, resolved]);

  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    const timer = window.setInterval(async () => {
      await loadRun();
      await Promise.all([loadPages(pagePage), loadIssues(issuePage)]);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [run?.status, id, pagePage, issuePage]);

  const issueCodes = useMemo(() => Object.entries(run?.summary?.issue_codes || {}).sort((a, b) => b[1] - a[1]), [run]);

  async function toggleIssue(issue: AuditIssue) {
    try {
      await apiFetch(`/audit/issues/${issue.id}/${issue.is_resolved ? "reopen" : "resolve"}/`, { method: "POST", body: "{}" });
      await Promise.all([loadIssues(issuePage), loadRun()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تغییر وضعیت Issue ناموفق بود");
    }
  }

  function searchPages() {
    setPagePage(1);
    loadPages(1);
  }

  if (!run) return <div>{message || "در حال بارگذاری Audit..."}</div>;

  return (
    <>
      <PageHeader
        title={`Audit: ${run.site_name}`}
        description={`${run.site_domain} · ${formatDate(run.started_at || run.created_at)}`}
        action={<div className="auditDetailActions"><Link href="/audit" className="btn secondary">بازگشت</Link><button type="button" className="btn secondary" onClick={() => Promise.all([loadRun(), loadPages(), loadIssues()])}>↻ بروزرسانی</button></div>}
      />

      {message && <div className="error">{message}</div>}
      {run.status === "failed" && <div className="error">Audit failed: {run.summary?.error || "Unknown crawler error"}</div>}
      {["queued", "running"].includes(run.status) && <div className="auditRunningNotice"><span className="auditPulse" />Crawler در حال اجراست؛ این صفحه هر ۴ ثانیه بروزرسانی می‌شود.</div>}
      {run.summary?.crawl_limit_reached && <div className="notice">Crawler به سقف {run.max_pages} صفحه رسیده است؛ برای پوشش بیشتر Audit جدید با Max Pages بالاتر اجرا کنید.</div>}

      <div className="auditDetailMetrics">
        <div className={`auditScoreCard score-${run.health_score >= 80 ? "good" : run.health_score >= 50 ? "medium" : "bad"}`}><span>Health Score</span><strong>{run.health_score}</strong><small>/100</small></div>
        <div className="auditMetricCard"><span>Crawled</span><strong>{run.pages_crawled}</strong><small>{run.summary?.html_pages || 0} HTML</small></div>
        <div className="auditMetricCard error"><span>Errors</span><strong>{run.summary?.errors || 0}</strong><small>critical issues</small></div>
        <div className="auditMetricCard warning"><span>Warnings</span><strong>{run.summary?.warnings || 0}</strong><small>{run.summary?.notices || 0} notices</small></div>
        <div className="auditMetricCard"><span>Indexable</span><strong>{run.summary?.indexable_pages || 0}</strong><small>pages</small></div>
        <div className="auditMetricCard"><span>Avg response</span><strong>{run.summary?.avg_response_ms || 0}</strong><small>ms</small></div>
      </div>

      {issueCodes.length > 0 && (
        <section className="panel auditTopIssues">
          <div className="auditSectionHeader"><div><h2>Top Issues</h2><p>بیشترین مشکلات شناسایی‌شده در این crawl.</p></div></div>
          <div className="auditIssueCodeGrid">
            {issueCodes.slice(0, 10).map(([code, count]) => <button key={code} type="button" onClick={() => { setIssueCode(code); setIssuePage(1); setTab("issues"); }}><strong>{count}</strong><span>{code.replaceAll("_", " ")}</span></button>)}
          </div>
        </section>
      )}

      <div className="auditTabs">
        <button className={tab === "issues" ? "active" : ""} onClick={() => setTab("issues")}>Issues <span>{run.issue_count}</span></button>
        <button className={tab === "pages" ? "active" : ""} onClick={() => setTab("pages")}>Pages <span>{run.pages_crawled}</span></button>
      </div>

      {tab === "issues" ? (
        <section className="panel auditDataPanel">
          <div className="auditFilters">
            <select value={severity} onChange={(e) => { setSeverity(e.target.value); setIssuePage(1); }}><option value="">همه Severityها</option><option value="error">Error</option><option value="warning">Warning</option><option value="notice">Notice</option></select>
            <select value={issueCode} onChange={(e) => { setIssueCode(e.target.value); setIssuePage(1); }}><option value="">همه Issueها</option>{issueCodes.map(([code, count]) => <option key={code} value={code}>{code} ({count})</option>)}</select>
            <select value={resolved} onChange={(e) => { setResolved(e.target.value); setIssuePage(1); }}><option value="false">Open issues</option><option value="true">Resolved</option><option value="">همه</option></select>
            <button type="button" className="btn secondary small" onClick={() => { setSeverity(""); setIssueCode(""); setResolved("false"); setIssuePage(1); }}>پاک کردن فیلتر</button>
          </div>
          <div className="auditIssueList">
            {(issues?.results || []).map((issue) => (
              <article className={`auditIssueRow ${issue.is_resolved ? "resolved" : ""}`} key={issue.id}>
                <span className={severityBadge(issue.severity)}>{issue.severity}</span>
                <div className="auditIssueBody"><div><strong>{issue.title}</strong><code>{issue.code}</code></div><a href={issue.url} target="_blank" rel="noreferrer">{issue.page_path || issue.url}</a>{Object.keys(issue.details || {}).length > 0 && <details><summary>جزئیات</summary><pre dir="ltr">{JSON.stringify(issue.details, null, 2)}</pre></details>}</div>
                <button type="button" className="btn secondary small" onClick={() => toggleIssue(issue)}>{issue.is_resolved ? "بازگشایی" : "Resolved"}</button>
              </article>
            ))}
            {issues && issues.results.length === 0 && <div className="emptyState">Issue مطابق فیلتر پیدا نشد.</div>}
          </div>
          <Pagination page={issuePage} previous={issues?.previous} next={issues?.next} count={issues?.count || 0} onChange={setIssuePage} />
        </section>
      ) : (
        <section className="panel auditDataPanel">
          <div className="auditFilters pageFilters">
            <input value={pageSearch} onChange={(e) => setPageSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchPages()} placeholder="جستجو در URL، Title، Canonical..." />
            <select value={indexability} onChange={(e) => { setIndexability(e.target.value); setPagePage(1); }}><option value="">همه صفحات</option><option value="true">Indexable</option><option value="false">Noindex</option></select>
            <select value={pageOrdering} onChange={(e) => { setPageOrdering(e.target.value); setPagePage(1); }}><option value="-issue_count">بیشترین Issues</option><option value="-response_ms">کندترین Response</option><option value="word_count">کمترین Words</option><option value="-incoming_internal_links">بیشترین Incoming Links</option><option value="url">URL</option></select>
            <button type="button" className="btn secondary small" onClick={searchPages}>جستجو</button>
          </div>
          <div className="tableWrap"><table className="table auditPagesTable"><thead><tr><th>URL</th><th>Status</th><th>Index</th><th>Title</th><th>H1</th><th>Words</th><th>Links</th><th>Alt</th><th>Response</th><th>Issues</th></tr></thead><tbody>{(pages?.results || []).map((page) => <tr key={page.id}><td><a href={page.url} target="_blank" rel="noreferrer"><strong>{page.path || "/"}</strong><small>{page.final_url !== page.url ? `→ ${page.final_url}` : page.url}</small></a></td><td><span className={pageStatusClass(page.status_code)}>{page.status_code || "ERR"}</span></td><td><span className={page.is_indexable ? "auditIndexable" : "auditNoindex"}>{page.is_indexable ? "Index" : "Noindex"}</span></td><td><span className="auditTitleCell" title={page.title}>{page.title || "—"}</span><small>{page.title.length} chars</small></td><td>{page.h1_count}</td><td>{page.word_count}</td><td><span>{page.internal_links} in</span><small>{page.incoming_internal_links} incoming</small></td><td>{page.missing_alt_count ? <strong className="auditBadText">{page.missing_alt_count}</strong> : "✓"}</td><td>{page.response_ms} ms</td><td><strong className={page.issue_count ? "auditBadText" : "auditGoodText"}>{page.issue_count}</strong></td></tr>)}</tbody></table></div>
          <Pagination page={pagePage} previous={pages?.previous} next={pages?.next} count={pages?.count || 0} onChange={setPagePage} />
        </section>
      )}
    </>
  );
}

function Pagination({ page, previous, next, count, onChange }: { page: number; previous?: string | null; next?: string | null; count: number; onChange: (page: number) => void }) {
  if (count <= 50 && page === 1) return null;
  return <div className="auditPagination"><button type="button" className="btn secondary small" disabled={!previous} onClick={() => onChange(Math.max(1, page - 1))}>قبلی</button><span>صفحه {page} · {count} نتیجه</span><button type="button" className="btn secondary small" disabled={!next} onClick={() => onChange(page + 1)}>بعدی</button></div>;
}
