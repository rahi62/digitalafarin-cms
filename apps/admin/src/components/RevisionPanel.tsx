"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, Paginated } from "@/lib/api";

type Revision = {
  id: string;
  number: number;
  snapshot: Record<string, unknown>;
  created_by_name?: string;
  note?: string;
  created_at: string;
};

type CurrentEntry = {
  title?: string; slug?: string; path?: string; excerpt?: string; status?: string;
  blocks?: unknown[]; custom_fields?: Record<string, unknown>;
  parent?: string | null; categories?: string[]; tags?: string[]; is_featured?: boolean;
  scheduled_at?: string | null; published_at?: string | null;
  [key: string]: unknown;
};

type Props = { entryId: string; current: CurrentEntry; onRestored: (entry: any) => void };

const fields = [
  "title", "slug", "path", "excerpt", "status", "parent_id", "category_ids", "tag_ids",
  "is_featured", "scheduled_at", "published_at", "blocks", "custom_fields",
] as const;

const labels: Record<string, string> = {
  title: "عنوان", slug: "Slug", path: "Path", excerpt: "خلاصه", status: "وضعیت",
  parent_id: "صفحه والد", category_ids: "Categories", tag_ids: "Tags", is_featured: "Featured",
  scheduled_at: "زمان‌بندی", published_at: "زمان انتشار", blocks: "Blocks", custom_fields: "Custom fields",
};

function currentValue(entry: CurrentEntry, field: typeof fields[number]) {
  if (field === "parent_id") return entry.parent ?? null;
  if (field === "category_ids") return entry.categories ?? [];
  if (field === "tag_ids") return entry.tags ?? [];
  if (field === "is_featured") return Boolean(entry.is_featured);
  if (field === "blocks") return entry.blocks ?? [];
  if (field === "custom_fields") return entry.custom_fields ?? {};
  return entry[field] ?? null;
}

function currentSnapshot(entry: CurrentEntry) {
  return Object.fromEntries(fields.map((field) => [field, currentValue(entry, field)]));
}
function same(a: unknown, b: unknown) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
function formatted(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
function dateLabel(value: string) {
  try { return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

export default function RevisionPanel({ entryId, current, onRestored }: Props) {
  const [rows, setRows] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("current");

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<Revision>>(`/content/revisions/?entry=${encodeURIComponent(entryId)}`);
      setRows(data.results);
      setLeft((value) => value || data.results[0]?.id || "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "خطا در بارگذاری نسخه‌ها"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [entryId]);

  const leftSnapshot = useMemo(() => rows.find((row) => row.id === left)?.snapshot || {}, [rows, left]);
  const rightSnapshot = useMemo(() => right === "current" ? currentSnapshot(current) : rows.find((row) => row.id === right)?.snapshot || {}, [rows, right, current]);
  const changedFields = fields.filter((field) => !same(leftSnapshot[field], rightSnapshot[field]));

  async function restore(revision: Revision) {
    if (!window.confirm(`نسخه ${revision.number} بازیابی شود؟`)) return;
    setMessage("");
    try {
      const restored = await apiFetch<any>(`/content/entries/${entryId}/restore_revision/`, { method: "POST", body: JSON.stringify({ revision_id: revision.id }) });
      onRestored(restored);
      setMessage(`نسخه ${revision.number} بازیابی شد`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "خطا در بازیابی نسخه"); }
  }

  if (loading) return <section className="panel revisionPanel">در حال بارگذاری Revisionها...</section>;

  return (
    <section className="panel revisionPanel">
      <div className="revisionHeader"><div><h2>Revisions</h2><p>متن، ساختار، Taxonomy و وضعیت انتشار را مقایسه و بازیابی کنید.</p></div><span className="badge">{rows.length} نسخه</span></div>
      {message && <div className={message.includes("خطا") ? "error" : "notice"}>{message}</div>}
      {rows.length === 0 ? <div className="emptyState">هنوز Revision ثبت نشده است.</div> : <>
        <div className="revisionTimeline">{rows.slice(0, 8).map((row) => <div className="revisionItem" key={row.id}><span className="revisionNumber">#{row.number}</span><div><strong>{row.note || "Revision"}</strong><small>{dateLabel(row.created_at)} · {row.created_by_name || "system"}</small></div><button type="button" className="btn secondary small" onClick={() => restore(row)}>بازیابی</button></div>)}</div>
        <div className="revisionCompare">
          <div className="revisionCompareControls">
            <div className="field"><label>نسخه A</label><select value={left} onChange={(e) => setLeft(e.target.value)}>{rows.map((row) => <option value={row.id} key={row.id}>#{row.number} — {row.note || dateLabel(row.created_at)}</option>)}</select></div>
            <div className="compareArrow">←→</div>
            <div className="field"><label>نسخه B</label><select value={right} onChange={(e) => setRight(e.target.value)}><option value="current">نسخه فعلی</option>{rows.map((row) => <option value={row.id} key={row.id}>#{row.number} — {row.note || dateLabel(row.created_at)}</option>)}</select></div>
          </div>
          {changedFields.length === 0 ? <div className="revisionNoChanges">تفاوتی بین دو نسخه انتخاب‌شده وجود ندارد.</div> : <div className="revisionDiffs">{changedFields.map((field) => <details className="revisionDiff" key={field} open={["title", "excerpt", "status", "category_ids", "tag_ids"].includes(field)}><summary>{labels[field]}</summary><div className="revisionDiffGrid"><div><span>نسخه A</span><pre dir={field === "path" || field === "slug" ? "ltr" : "auto"}>{formatted(leftSnapshot[field])}</pre></div><div><span>نسخه B</span><pre dir={field === "path" || field === "slug" ? "ltr" : "auto"}>{formatted(rightSnapshot[field])}</pre></div></div></details>)}</div>}
        </div>
      </>}
    </section>
  );
}
