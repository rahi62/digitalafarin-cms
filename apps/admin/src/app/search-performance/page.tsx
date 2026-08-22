"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string; domain: string };
type SearchMetric = {
  id: string;
  date: string;
  path: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  source: string;
  entry_title?: string;
};
type DecaySignal = {
  code: string;
  label: string;
  severity: "error" | "warning" | "notice";
  reason: string;
  recommendation: string;
};
type DecayItem = {
  path: string;
  entry: { id: string; title: string; updated_at: string; status: string } | null;
  current: { clicks: number; impressions: number; ctr: number; position: number };
  baseline: { clicks: number; impressions: number; ctr: number; position: number };
  delta: { clicks_pct: number | null; impressions_pct: number | null; ctr_pct: number | null; position: number };
  age_days: number | null;
  decay_score: number;
  priority: "high" | "medium" | "low";
  signals: DecaySignal[];
};
type DecayPayload = {
  site: string;
  site_name: string;
  windows: null | {
    current: { start: string; end: string; days: number };
    baseline: { start: string; end: string; days: number };
    latest_data_date: string;
  };
  summary: {
    pages_analyzed: number;
    flagged: number;
    high_priority: number;
    ranking_decay?: number;
    ctr_issues?: number;
    demand_decay?: number;
    refresh_candidates?: number;
    quick_wins?: number;
  };
  results: DecayItem[];
};
type ImportRun = {
  id: string;
  rows_received: number;
  rows_upserted: number;
  date_start: string;
  date_end: string;
  provider: string;
};
type Tab = "decay" | "import" | "raw";

type ImportRow = {
  date: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position: number;
};

function pct(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function deltaClass(value: number | null, inverted = false) {
  if (value === null || Math.abs(value) < 0.1) return "neutral";
  const bad = inverted ? value > 0 : value < 0;
  return bad ? "bad" : "good";
}

function parseImportRows(raw: string): ImportRow[] {
  const text = raw.trim();
  if (!text) throw new Error("داده‌ای برای Import وارد نشده است");
  if (text.startsWith("[")) {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw new Error("JSON باید آرایه‌ای از rowها باشد");
    return parsed.map((row) => normalizeImportRow(row as Record<string, unknown>));
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV باید header و حداقل یک row داشته باشد");
  const headers = lines[0].split(",").map((item) => item.trim().toLowerCase());
  const required = ["date", "page", "clicks", "impressions", "position"];
  for (const key of required) if (!headers.includes(key)) throw new Error(`ستون ${key} در CSV وجود ندارد`);

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((item) => item.trim());
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => { record[header] = cells[index] ?? ""; });
    return normalizeImportRow(record);
  });
}

function normalizeImportRow(row: Record<string, unknown>): ImportRow {
  const numeric = (key: string) => {
    const value = String(row[key] ?? "").replace("%", "").trim();
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`مقدار ${key} نامعتبر است`);
    return parsed;
  };
  const date = String(row.date ?? "").trim();
  const page = String(row.page ?? row.url ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date باید به فرمت YYYY-MM-DD باشد");
  if (!page) throw new Error("page الزامی است");
  const ctrRaw = String(row.ctr ?? "").trim();
  return {
    date,
    page,
    clicks: numeric("clicks"),
    impressions: numeric("impressions"),
    position: numeric("position"),
    ...(ctrRaw ? { ctr: numeric("ctr") } : {}),
  };
}

export default function SearchPerformancePage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [tab, setTab] = useState<Tab>("decay");
  const [decay, setDecay] = useState<DecayPayload | null>(null);
  const [metrics, setMetrics] = useState<Paginated<SearchMetric> | null>(null);
  const [currentDays, setCurrentDays] = useState(28);
  const [minImpressions, setMinImpressions] = useState(100);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("date,page,clicks,impressions,ctr,position\n2026-08-01,https://example.com/page/,120,2400,5,4.8");
  const [sourceLabel, setSourceLabel] = useState("GSC export");
  const [importing, setImporting] = useState(false);

  const site = useMemo(() => sites.find((item) => item.id === siteId), [sites, siteId]);

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/")
      .then((data) => {
        setSites(data.results);
        if (data.results[0]) setSiteId(data.results[0].id);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری سایت‌ها"));
  }, []);

  useEffect(() => {
    if (!siteId) return;
    loadDecay();
    loadMetrics();
  }, [siteId]);

  async function loadDecay() {
    if (!siteId) return;
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams({
        site: siteId,
        current_days: String(currentDays),
        baseline_days: String(currentDays),
        min_impressions: String(minImpressions),
      });
      setDecay(await apiFetch<DecayPayload>(`/integrations/search-performance/decay/?${query.toString()}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در تحلیل Content Decay");
    } finally {
      setLoading(false);
    }
  }

  async function loadMetrics() {
    if (!siteId) return;
    try {
      const query = new URLSearchParams({ site: siteId, ordering: "-date,-impressions" });
      setMetrics(await apiFetch<Paginated<SearchMetric>>(`/integrations/search-performance/?${query.toString()}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در دریافت Search Performance");
    }
  }

  async function runImport() {
    if (!siteId) return;
    setImporting(true);
    setMessage("");
    try {
      const rows = parseImportRows(importText);
      const run = await apiFetch<ImportRun>("/integrations/search-performance/import/", {
        method: "POST",
        body: JSON.stringify({ site: siteId, provider: "manual", source_label: sourceLabel, rows }),
      });
      setMessage(`${run.rows_upserted} row برای بازه ${run.date_start} تا ${run.date_end} وارد شد.`);
      await Promise.all([loadDecay(), loadMetrics()]);
      setTab("decay");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import ناموفق بود");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Search Performance"
        description="Google Search Console data foundation، Content Decay و فرصت‌های رشد صفحات"
        action={
          <div className="searchPerfHeaderActions">
            <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
              {sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}
            </select>
            <button type="button" className="btn secondary" onClick={() => Promise.all([loadDecay(), loadMetrics()])}>↻ بروزرسانی</button>
          </div>
        }
      />

      {message && <div className={message.includes("row") ? "notice" : "error"}>{message}</div>}

      <div className="searchPerfTabs">
        <button className={tab === "decay" ? "active" : ""} onClick={() => setTab("decay")}>Content Decay</button>
        <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>Import Data</button>
        <button className={tab === "raw" ? "active" : ""} onClick={() => setTab("raw")}>Raw Performance</button>
      </div>

      {tab === "decay" ? (
        <DecayTab
          site={site}
          payload={decay}
          loading={loading}
          currentDays={currentDays}
          minImpressions={minImpressions}
          onCurrentDays={setCurrentDays}
          onMinImpressions={setMinImpressions}
          onAnalyze={loadDecay}
        />
      ) : tab === "import" ? (
        <ImportTab
          text={importText}
          setText={setImportText}
          sourceLabel={sourceLabel}
          setSourceLabel={setSourceLabel}
          importing={importing}
          onImport={runImport}
        />
      ) : (
        <RawTab metrics={metrics} />
      )}
    </>
  );
}

function DecayTab({ site, payload, loading, currentDays, minImpressions, onCurrentDays, onMinImpressions, onAnalyze }: {
  site?: Site;
  payload: DecayPayload | null;
  loading: boolean;
  currentDays: number;
  minImpressions: number;
  onCurrentDays: (value: number) => void;
  onMinImpressions: (value: number) => void;
  onAnalyze: () => void;
}) {
  const summary = payload?.summary;
  return <>
    <section className="panel searchPerfControls">
      <div><strong>{site?.name || "Site"}</strong><span>دو بازه هم‌اندازه با هم مقایسه می‌شوند.</span></div>
      <label>Window<select value={currentDays} onChange={(e) => onCurrentDays(Number(e.target.value))}><option value={14}>14 روز</option><option value={28}>28 روز</option><option value={56}>56 روز</option><option value={90}>90 روز</option></select></label>
      <label>Min Impressions<input type="number" min={0} value={minImpressions} onChange={(e) => onMinImpressions(Number(e.target.value))} /></label>
      <button type="button" className="btn" onClick={onAnalyze} disabled={loading}>{loading ? "در حال تحلیل..." : "تحلیل مجدد"}</button>
    </section>

    {payload?.windows && <div className="searchPerfWindowNote">Current: <b>{payload.windows.current.start}</b> → <b>{payload.windows.current.end}</b> · Baseline: <b>{payload.windows.baseline.start}</b> → <b>{payload.windows.baseline.end}</b> · Latest data: <b>{payload.windows.latest_data_date}</b></div>}

    <div className="searchPerfMetrics">
      <MetricCard label="Pages analyzed" value={summary?.pages_analyzed || 0} />
      <MetricCard label="High priority" value={summary?.high_priority || 0} tone="bad" />
      <MetricCard label="Ranking decay" value={summary?.ranking_decay || 0} tone="bad" />
      <MetricCard label="CTR issues" value={summary?.ctr_issues || 0} tone="warning" />
      <MetricCard label="Refresh candidates" value={summary?.refresh_candidates || 0} />
      <MetricCard label="Quick wins" value={summary?.quick_wins || 0} tone="good" />
    </div>

    <section className="panel decayTablePanel">
      <div className="searchPerfSectionHeader"><div><h2>Priority Pages</h2><p>صفحاتی که افت یا فرصت قابل اقدام دارند، بر اساس Decay Score مرتب شده‌اند.</p></div><span>{summary?.flagged || 0} flagged</span></div>
      {!payload || payload.results.length === 0 ? <div className="emptyState">داده کافی یا سیگنال قابل اقدام پیدا نشد. ابتدا داده GSC را Import کنید.</div> : (
        <div className="tableWrap"><table className="table decayTable"><thead><tr><th>Page</th><th>Signals</th><th>Clicks</th><th>Impressions</th><th>Position</th><th>Score</th><th>Action</th></tr></thead><tbody>
          {payload.results.map((item) => <DecayRow key={item.path} item={item} />)}
        </tbody></table></div>
      )}
    </section>
  </>;
}

function DecayRow({ item }: { item: DecayItem }) {
  return <tr>
    <td><div className="decayPageCell"><strong>{item.entry?.title || item.path}</strong><code dir="ltr">{item.path}</code>{item.age_days !== null && <small>{item.age_days} روز از آخرین ویرایش</small>}</div></td>
    <td><div className="decaySignals">{item.signals.map((signal) => <span key={signal.code} className={`decaySignal ${signal.severity}`} title={signal.reason}>{signal.label}</span>)}</div></td>
    <td><strong>{item.current.clicks}</strong><small className={deltaClass(item.delta.clicks_pct)}>{pct(item.delta.clicks_pct)}</small></td>
    <td><strong>{item.current.impressions}</strong><small className={deltaClass(item.delta.impressions_pct)}>{pct(item.delta.impressions_pct)}</small></td>
    <td><strong>{item.current.position}</strong><small className={deltaClass(item.delta.position, true)}>{item.delta.position > 0 ? "+" : ""}{item.delta.position.toFixed(1)}</small></td>
    <td><span className={`decayScore ${item.priority}`}>{item.decay_score}</span></td>
    <td><details className="decayAction"><summary>پیشنهاد</summary>{item.signals.map((signal) => <div key={signal.code}><strong>{signal.label}</strong><p>{signal.recommendation}</p></div>)}</details></td>
  </tr>;
}

function ImportTab({ text, setText, sourceLabel, setSourceLabel, importing, onImport }: {
  text: string;
  setText: (value: string) => void;
  sourceLabel: string;
  setSourceLabel: (value: string) => void;
  importing: boolean;
  onImport: () => void;
}) {
  return <section className="panel searchImportPanel">
    <div className="searchPerfSectionHeader"><div><h2>Import Search Console Data</h2><p>فعلاً CSV یا JSON page-level وارد کنید. OAuth sync در لایه بعدی روی همین data model سوار می‌شود.</p></div></div>
    <div className="searchImportGuide"><code>date,page,clicks,impressions,ctr,position</code><span>CTR می‌تواند 0.05 یا 5 باشد؛ هر دو به 5٪ تبدیل می‌شوند.</span></div>
    <div className="field"><label>Source label</label><input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="GSC export - Aug 2026" /></div>
    <div className="field"><label>CSV / JSON</label><textarea dir="ltr" className="searchImportTextarea" value={text} onChange={(e) => setText(e.target.value)} /></div>
    <div className="searchImportFooter"><button type="button" className="btn" disabled={importing} onClick={onImport}>{importing ? "در حال Import..." : "Import & Analyze"}</button><span>حداکثر 5000 row در هر import؛ row تکراری برای همان site/date/path به‌صورت upsert بروزرسانی می‌شود.</span></div>
  </section>;
}

function RawTab({ metrics }: { metrics: Paginated<SearchMetric> | null }) {
  return <section className="panel searchRawPanel">
    <div className="searchPerfSectionHeader"><div><h2>Daily Page Performance</h2><p>داده خام page-level ذخیره‌شده برای سایت انتخاب‌شده.</p></div><span>{metrics?.count || 0} rows</span></div>
    {!metrics || metrics.results.length === 0 ? <div className="emptyState">هنوز داده Search Performance وارد نشده است.</div> : <div className="tableWrap"><table className="table"><thead><tr><th>Date</th><th>Page</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th><th>Source</th></tr></thead><tbody>{metrics.results.map((row) => <tr key={row.id}><td>{row.date}</td><td><strong>{row.entry_title || row.path}</strong><small className="rawPath">{row.path}</small></td><td>{row.clicks}</td><td>{row.impressions}</td><td>{(row.ctr * 100).toFixed(2)}%</td><td>{row.position.toFixed(2)}</td><td><span className="badge">{row.source}</span></td></tr>)}</tbody></table></div>}
  </section>;
}

function MetricCard({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return <div className={`searchPerfMetric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
