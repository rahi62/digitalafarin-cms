"use client";

import { useEffect, useState } from "react";
import { apiFetch, Paginated } from "@/lib/api";

type Suggestion = {
  id: string;
  source_entry: string;
  source_title: string;
  source_path: string;
  target_entry: string;
  target_title: string;
  target_path: string;
  anchor_text: string;
  score: string | number;
  status: string;
};

type GenerateResponse = { count: number; results: Suggestion[] };

export default function InternalLinksPanel({ entryId }: { entryId: string }) {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<Suggestion>>(`/seo/internal-links/?source_entry=${encodeURIComponent(entryId)}`);
      setRows(data.results);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری لینک‌های داخلی");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [entryId]);

  async function generate() {
    setGenerating(true);
    setMessage("");
    try {
      const data = await apiFetch<GenerateResponse>("/seo/internal-links/generate/", {
        method: "POST",
        body: JSON.stringify({ source_entry: entryId }),
      });
      const refreshed = await apiFetch<Paginated<Suggestion>>(`/seo/internal-links/?source_entry=${encodeURIComponent(entryId)}`);
      setRows(refreshed.results);
      setMessage(`${data.count} پیشنهاد لینک داخلی ساخته شد`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در تولید پیشنهادها");
    } finally {
      setGenerating(false);
    }
  }

  async function setStatus(row: Suggestion, status: string) {
    try {
      const updated = await apiFetch<Suggestion>(`/seo/internal-links/${row.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...updated } : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در تغییر وضعیت پیشنهاد");
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("مسیر لینک کپی شد");
    } catch {
      setMessage("امکان کپی خودکار وجود ندارد");
    }
  }

  if (loading) return <section className="panel internalLinksPanel">در حال تحلیل لینک‌های داخلی...</section>;

  const suggested = rows.filter((row) => row.status === "suggested");
  const decided = rows.filter((row) => row.status !== "suggested");

  return (
    <section className="panel internalLinksPanel">
      <div className="internalLinksHeader">
        <div>
          <h2>Internal Linking</h2>
          <p>پیشنهاد لینک بر اساس عنوان صفحات، Focus Keyword و همپوشانی محتوایی.</p>
        </div>
        <button type="button" className="btn" onClick={generate} disabled={generating}>
          {generating ? "در حال تحلیل..." : "تولید پیشنهادها"}
        </button>
      </div>

      {message && <div className={message.includes("خطا") || message.includes("وجود ندارد") ? "error" : "notice"}>{message}</div>}

      {suggested.length === 0 && (
        <div className="emptyState">
          <strong>پیشنهاد فعالی وجود ندارد.</strong>
          <span>پس از ذخیره محتوای صفحه، «تولید پیشنهادها» را اجرا کنید.</span>
        </div>
      )}

      <div className="linkSuggestionList">
        {suggested.map((row) => (
          <article className="linkSuggestion" key={row.id}>
            <div className="linkScore"><strong>{Math.round(Number(row.score))}</strong><span>score</span></div>
            <div className="linkSuggestionBody">
              <div className="linkSuggestionTarget">
                <strong>{row.target_title}</strong>
                <code dir="ltr">{row.target_path}</code>
              </div>
              <div className="anchorPreview">
                Anchor پیشنهادی: <strong>{row.anchor_text}</strong>
              </div>
            </div>
            <div className="linkSuggestionActions">
              <button type="button" className="btn secondary small" onClick={() => copy(row.target_path)}>کپی مسیر</button>
              <button type="button" className="btn small" onClick={() => setStatus(row, "accepted")}>تایید</button>
              <button type="button" className="textDanger" onClick={() => setStatus(row, "rejected")}>رد</button>
            </div>
          </article>
        ))}
      </div>

      {decided.length > 0 && (
        <details className="linkHistory">
          <summary>تصمیم‌های قبلی ({decided.length})</summary>
          <div className="linkHistoryList">
            {decided.map((row) => (
              <div key={row.id}>
                <span className={`badge ${row.status === "accepted" ? "green" : "warn"}`}>{row.status}</span>
                <strong>{row.target_title}</strong>
                <code dir="ltr">{row.target_path}</code>
                <button type="button" className="textButton" onClick={() => setStatus(row, "suggested")}>بازگردانی</button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="internalLinkNote">
        پیشنهادها فقط راهنما هستند؛ تایید یک پیشنهاد هنوز متن صفحه را خودکار تغییر نمی‌دهد تا ویرایشگر کنترل کامل روی محل و متن لینک داشته باشد.
      </div>
    </section>
  );
}
