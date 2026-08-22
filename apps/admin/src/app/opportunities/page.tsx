"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string; domain: string };
type SearchMetrics = {
  current: { clicks: number; impressions: number; ctr: number; position: number };
  delta: { clicks_pct: number | null; impressions_pct: number | null; ctr_pct: number | null; position: number };
  decay_score: number;
};
type OpportunityAction = {
  type: string;
  label: string;
  reason: string;
  recommendation: string;
  severity: "error" | "warning" | "notice";
  source: string;
};
type Opportunity = {
  entry: { id: string; title: string; path: string; updated_at: string };
  score: number;
  priority: "high" | "medium" | "low";
  metrics: {
    search: SearchMetrics | null;
    seo_score: number | null;
    audit_issue_count: number;
    audit_errors: number;
    audit_warnings: number;
    incoming_internal_links: number | null;
    word_count: number | null;
    age_days: number;
  };
  audit_issue_codes: Record<string, number>;
  actions: OpportunityAction[];
};
type OpportunityPayload = {
  site: string;
  site_name: string;
  sources: {
    audit_run: string | null;
    audit_finished_at: string | null;
    search_windows: null | {
      current: { start: string; end: string; days: number };
      baseline: { start: string; end: string; days: number };
      latest_data_date: string;
    };
  };
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
    actions: Record<string, number>;
  };
  results: Opportunity[];
};

function formatPct(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function metricTone(value: number | null, inverted = false) {
  if (value === null || Math.abs(value) < 0.1) return "neutral";
  const bad = inverted ? value > 0 : value < 0;
  return bad ? "bad" : "good";
}

export default function SeoOpportunitiesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [payload, setPayload] = useState<OpportunityPayload | null>(null);
  const [priority, setPriority] = useState("");
  const [actionType, setActionType] = useState("");
  const [currentDays, setCurrentDays] = useState(28);
  const [minImpressions, setMinImpressions] = useState(100);
  const [includeLow, setIncludeLow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/")
      .then((data) => {
        setSites(data.results);
        if (data.results[0]) setSiteId(data.results[0].id);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "خطا در دریافت سایت‌ها"));
  }, []);

  useEffect(() => {
    if (siteId) load();
  }, [siteId]);

  async function load() {
    if (!siteId) return;
    setLoading(true);
    setMessage("");
    try {
      const qs = new URLSearchParams({
        site: siteId,
        current_days: String(currentDays),
        min_impressions: String(minImpressions),
        limit: "200",
      });
      if (includeLow) qs.set("include_low", "true");
      setPayload(await apiFetch<OpportunityPayload>(`/seo/opportunities/?${qs.toString()}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در تولید SEO Opportunities");
    } finally {
      setLoading(false);
    }
  }

  const actionOptions = useMemo(() => {
    const types = new Map<string, string>();
    payload?.results.forEach((item) => item.actions.forEach((action) => types.set(action.type, action.label)));
    return Array.from(types.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [payload]);

  const results = useMemo(() => (payload?.results || []).filter((item) => {
    if (priority && item.priority !== priority) return false;
    if (actionType && !item.actions.some((action) => action.type === actionType)) return false;
    return true;
  }), [payload, priority, actionType]);

  return (
    <>
      <PageHeader
        title="SEO Opportunities"
        description="صف اقدام یکپارچه بر اساس Search Performance، Content Decay، SEO Audit و وضعیت On-page"
        action={
          <div className="opportunityHeaderActions">
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name} — {site.domain}</option>)}
            </select>
            <button type="button" className="btn" disabled={loading || !siteId} onClick={load}>{loading ? "در حال تحلیل..." : "تحلیل مجدد"}</button>
          </div>
        }
      />

      {message && <div className="error">{message}</div>}

      <section className="panel opportunityControls">
        <label>Search Window<select value={currentDays} onChange={(e) => setCurrentDays(Number(e.target.value))}><option value={14}>14 روز</option><option value={28}>28 روز</option><option value={56}>56 روز</option><option value={90}>90 روز</option></select></label>
        <label>Min Impressions<input type="number" min={0} value={minImpressions} onChange={(e) => setMinImpressions(Number(e.target.value))} /></label>
        <label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">همه</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label>Action<select value={actionType} onChange={(e) => setActionType(e.target.value)}><option value="">همه Actionها</option>{actionOptions.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
        <label className="opportunityToggle"><input type="checkbox" checked={includeLow} onChange={(e) => setIncludeLow(e.target.checked)} /><span>نمایش Low priority</span></label>
        <button type="button" className="btn secondary" onClick={load} disabled={loading}>اعمال</button>
      </section>

      <div className="opportunityMetrics">
        <Metric label="All opportunities" value={payload?.summary.total || 0} />
        <Metric label="High priority" value={payload?.summary.high || 0} tone="bad" />
        <Metric label="Medium" value={payload?.summary.medium || 0} tone="warning" />
        <Metric label="Refresh" value={payload?.summary.actions.refresh_content || 0} />
        <Metric label="Technical" value={payload?.summary.actions.fix_technical || 0} />
        <Metric label="Quick wins" value={payload?.summary.actions.quick_win || 0} tone="good" />
      </div>

      <SourceBar payload={payload} />

      <section className="opportunityList">
        {results.length === 0 ? <div className="panel emptyState">Opportunity مطابق فیلتر پیدا نشد؛ اگر داده GSC یا Audit ندارید ابتدا آن‌ها را تکمیل کنید.</div> : results.map((item) => <OpportunityCard key={item.entry.id} item={item} />)}
      </section>
    </>
  );
}

function SourceBar({ payload }: { payload: OpportunityPayload | null }) {
  if (!payload) return null;
  return <div className="opportunitySourceBar">
    <span>Audit: <b>{payload.sources.audit_run ? "connected" : "not available"}</b></span>
    <span>Search data: <b>{payload.sources.search_windows ? `تا ${payload.sources.search_windows.latest_data_date}` : "not available"}</b></span>
    <span>Queue: <b>{payload.summary.total} pages</b></span>
  </div>;
}

function OpportunityCard({ item }: { item: Opportunity }) {
  const search = item.metrics.search;
  return <article className={`panel opportunityCard priority-${item.priority}`}>
    <div className="opportunityCardTop">
      <div className="opportunityIdentity">
        <div className={`opportunityScore ${item.priority}`}><strong>{item.score}</strong><span>{item.priority}</span></div>
        <div><h2>{item.entry.title}</h2><code dir="ltr">{item.entry.path}</code><small>{item.metrics.age_days} روز از آخرین ویرایش</small></div>
      </div>
      <Link className="btn secondary small" href={`/content/${item.entry.id}`}>باز کردن Editor</Link>
    </div>

    <div className="opportunitySignals">
      {item.actions.map((action) => <span key={action.type} className={`opportunityActionBadge ${action.severity}`}>{action.label}</span>)}
    </div>

    <div className="opportunityDataGrid">
      <Data label="SEO Score" value={item.metrics.seo_score === null ? "—" : `${item.metrics.seo_score}/100`} bad={item.metrics.seo_score !== null && item.metrics.seo_score < 70} />
      <Data label="Audit Issues" value={String(item.metrics.audit_issue_count)} bad={item.metrics.audit_errors > 0} />
      <Data label="Incoming Links" value={item.metrics.incoming_internal_links === null ? "—" : String(item.metrics.incoming_internal_links)} bad={item.metrics.incoming_internal_links === 0} />
      <Data label="Clicks" value={search ? String(search.current.clicks) : "—"} sub={search ? formatPct(search.delta.clicks_pct) : undefined} tone={search ? metricTone(search.delta.clicks_pct) : undefined} />
      <Data label="Impressions" value={search ? String(search.current.impressions) : "—"} sub={search ? formatPct(search.delta.impressions_pct) : undefined} tone={search ? metricTone(search.delta.impressions_pct) : undefined} />
      <Data label="Position" value={search ? String(search.current.position) : "—"} sub={search ? `${search.delta.position > 0 ? "+" : ""}${search.delta.position.toFixed(1)}` : undefined} tone={search ? metricTone(search.delta.position, true) : undefined} />
    </div>

    <div className="opportunityActionsList">
      {item.actions.map((action, index) => <div className={`opportunityAction ${action.severity}`} key={`${action.type}-${index}`}><div><strong>{action.label}</strong><span>{action.source}</span></div><p>{action.reason}</p><b>پیشنهاد:</b><p>{action.recommendation}</p></div>)}
    </div>
  </article>;
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return <div className={`opportunityMetric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Data({ label, value, sub, bad, tone }: { label: string; value: string; sub?: string; bad?: boolean; tone?: string }) {
  return <div className={`opportunityData ${bad ? "bad" : ""}`}><span>{label}</span><strong>{value}</strong>{sub && <small className={tone || "neutral"}>{sub}</small>}</div>;
}
