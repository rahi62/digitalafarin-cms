"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string; domain: string };
type Run = {
  id: string; site: string; site_name: string; site_domain: string; status: string;
  health_score: number; pages_crawled: number; issue_count: number; created_at: string; finished_at: string | null;
};
type ComparisonIssue = {
  id: string; code: string; severity: "error" | "warning" | "notice";
  title: string; url: string; page_path: string | null; details: Record<string, unknown>;
};
type RunSnapshot = {
  id: string; created_at: string; health_score: number; pages_crawled: number; issues: number;
  severity: { error: number; warning: number; notice: number };
};
type Comparison = {
  has_baseline: boolean;
  current: RunSnapshot;
  baseline: RunSnapshot | null;
  delta: { health_score: number; pages_crawled: number; issues: number; errors: number; warnings: number };
  counts: { new: number; fixed: number; persistent: number };
  new_issues: ComparisonIssue[];
  fixed_issues: ComparisonIssue[];
  persistent_issues: ComparisonIssue[];
  truncated: { new: boolean; fixed: boolean; persistent: boolean };
};
type TrendTab = "new" | "fixed" | "persistent";

function formatDate(value: string | null) {
  if (!value) return "—";
  try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

function deltaLabel(value: number, suffix = "") {
  if (value > 0) return `+${value}${suffix}`;
  return `${value}${suffix}`;
}

export default function AuditTrendsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [site, setSite] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [baselineId, setBaselineId] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [tab, setTab] = useState<TrendTab>("new");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Paginated<Site>>("/sites/"),
      apiFetch<Paginated<Run>>("/audit/runs/?status=done&ordering=-created_at"),
    ]).then(([siteData, runData]) => {
      setSites(siteData.results);
      setRuns(runData.results);
      const initialSite = siteData.results[0]?.id || runData.results[0]?.site || "";
      setSite(initialSite);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری Audit Trends"));
  }, []);

  const siteRuns = useMemo(
    () => runs.filter((run) => run.site === site),
    [runs, site],
  );

  useEffect(() => {
    const latest = siteRuns[0];
    setCurrentId(latest?.id || "");
    setBaselineId("");
    setComparison(null);
  }, [site, siteRuns.length]);

  useEffect(() => {
    if (!currentId) return;
    let cancelled = false;
    setLoading(true);
    setMessage("");
    const suffix = baselineId ? `?baseline=${encodeURIComponent(baselineId)}` : "";
    apiFetch<Comparison>(`/audit/runs/${currentId}/compare/${suffix}`)
      .then((data) => { if (!cancelled) setComparison(data); })
      .catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "مقایسه Audit ناموفق بود"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentId, baselineId]);

  const currentRun = siteRuns.find((run) => run.id === currentId);
  const baselineOptions = siteRuns.filter((run) => run.id !== currentId);
  const list = tab === "new"
    ? comparison?.new_issues || []
    : tab === "fixed"
      ? comparison?.fixed_issues || []
      : comparison?.persistent_issues || [];

  return (
    <>
      <PageHeader
        title="Audit Trends"
        description="مقایسه Crawlها برای تشخیص Issueهای جدید، رفع‌شده و ماندگار"
        action={<Link href="/audit" className="btn secondary">SEO Audit</Link>}
      />

      {message && <div className="error">{message}</div>}

      <section className="panel auditTrendControls">
        <div className="field">
          <label>سایت</label>
          <select value={site} onChange={(e) => setSite(e.target.value)}>{sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}</select>
        </div>
        <div className="field">
          <label>Current crawl</label>
          <select value={currentId} onChange={(e) => { setCurrentId(e.target.value); setBaselineId(""); }}>
            {siteRuns.map((run) => <option key={run.id} value={run.id}>{formatDate(run.finished_at || run.created_at)} · Score {run.health_score}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Baseline</label>
          <select value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
            <option value="">Audit قبلی به‌صورت خودکار</option>
            {baselineOptions.map((run) => <option key={run.id} value={run.id}>{formatDate(run.finished_at || run.created_at)} · Score {run.health_score}</option>)}
          </select>
        </div>
        {currentRun && <Link href={`/audit/${currentRun.id}`} className="btn secondary auditTrendOpenRun">مشاهده Current Run</Link>}
      </section>

      {siteRuns.length === 0 && <div className="emptyState">برای این سایت حداقل یک Audit کامل‌شده لازم است.</div>}
      {loading && <div className="auditRunningNotice"><span className="auditPulse" />در حال مقایسه crawlها...</div>}

      {comparison && !loading && (
        <>
          {!comparison.has_baseline && <div className="notice">برای این Run، Audit قبلی وجود ندارد؛ همه Issueهای فعلی به‌عنوان New نمایش داده می‌شوند.</div>}

          <div className="auditTrendHero">
            <div className={`auditTrendScore ${comparison.delta.health_score >= 0 ? "improved" : "regressed"}`}>
              <span>Health Score</span>
              <div><strong>{comparison.current.health_score}</strong>{comparison.baseline && <small>از {comparison.baseline.health_score}</small>}</div>
              <b>{comparison.has_baseline ? deltaLabel(comparison.delta.health_score) : "First run"}</b>
            </div>
            <div className="auditTrendCard new"><span>New Issues</span><strong>{comparison.counts.new}</strong><small>{deltaLabel(comparison.delta.errors)} error delta</small></div>
            <div className="auditTrendCard fixed"><span>Fixed Issues</span><strong>{comparison.counts.fixed}</strong><small>حل‌شده از crawl قبلی</small></div>
            <div className="auditTrendCard persistent"><span>Persistent</span><strong>{comparison.counts.persistent}</strong><small>هنوز باقی مانده</small></div>
            <div className="auditTrendCard"><span>Total Issues Delta</span><strong className={comparison.delta.issues <= 0 ? "auditGoodText" : "auditBadText"}>{deltaLabel(comparison.delta.issues)}</strong><small>{deltaLabel(comparison.delta.warnings)} warning delta</small></div>
          </div>

          <section className="panel auditTrendSummary">
            <div className="auditSectionHeader">
              <div><h2>Run Comparison</h2><p>{comparison.baseline ? `${formatDate(comparison.baseline.created_at)} ← ${formatDate(comparison.current.created_at)}` : formatDate(comparison.current.created_at)}</p></div>
            </div>
            <div className="auditTrendSeverityGrid">
              {(["error", "warning", "notice"] as const).map((severity) => (
                <div key={severity}><span>{severity}</span><strong>{comparison.current.severity[severity]}</strong><small>{comparison.baseline ? `قبل: ${comparison.baseline.severity[severity]}` : ""}</small></div>
              ))}
              <div><span>Pages</span><strong>{comparison.current.pages_crawled}</strong><small>{comparison.baseline ? `قبل: ${comparison.baseline.pages_crawled} · ${deltaLabel(comparison.delta.pages_crawled)}` : ""}</small></div>
            </div>
          </section>

          <div className="auditTrendTabs">
            <button className={tab === "new" ? "active new" : ""} onClick={() => setTab("new")}>New <span>{comparison.counts.new}</span></button>
            <button className={tab === "fixed" ? "active fixed" : ""} onClick={() => setTab("fixed")}>Fixed <span>{comparison.counts.fixed}</span></button>
            <button className={tab === "persistent" ? "active persistent" : ""} onClick={() => setTab("persistent")}>Persistent <span>{comparison.counts.persistent}</span></button>
          </div>

          <section className="panel auditTrendIssues">
            <div className="auditTrendIssueList">
              {list.map((issue) => (
                <article key={`${tab}-${issue.id}`}>
                  <span className={`badge auditSeverity ${issue.severity}`}>{issue.severity}</span>
                  <div><div><strong>{issue.title}</strong><code>{issue.code}</code></div><a href={issue.url} target="_blank" rel="noreferrer">{issue.page_path || issue.url}</a>{Object.keys(issue.details || {}).length > 0 && <details><summary>جزئیات</summary><pre dir="ltr">{JSON.stringify(issue.details, null, 2)}</pre></details>}</div>
                </article>
              ))}
              {list.length === 0 && <div className="emptyState">در این گروه Issue وجود ندارد.</div>}
              {comparison.truncated[tab] && <div className="notice">فقط ۱۰۰ Issue اول نمایش داده شده است.</div>}
            </div>
          </section>
        </>
      )}
    </>
  );
}
