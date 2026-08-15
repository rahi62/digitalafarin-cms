"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, Paginated } from "@/lib/api";

type SeoMeta = {
  id?: string;
  entry: string;
  title: string;
  description: string;
  canonical_url: string;
  robots_index: boolean;
  robots_follow: boolean;
  og_title: string;
  og_description: string;
  og_image: string;
  twitter_card: string;
  focus_keyword: string;
  secondary_keywords: string[];
  seo_score: number;
  analysis: {
    checks?: Record<string, boolean>;
    metrics?: Record<string, number>;
  };
};

type Props = {
  entryId: string;
  pageTitle: string;
  pagePath: string;
};

const emptyMeta = (entryId: string): SeoMeta => ({
  entry: entryId,
  title: "",
  description: "",
  canonical_url: "",
  robots_index: true,
  robots_follow: true,
  og_title: "",
  og_description: "",
  og_image: "",
  twitter_card: "summary_large_image",
  focus_keyword: "",
  secondary_keywords: [],
  seo_score: 0,
  analysis: {},
});

function writablePayload(meta: SeoMeta, entryId: string) {
  const { id: _id, seo_score: _score, analysis: _analysis, ...writable } = meta;
  return { ...writable, entry: entryId };
}

const labels: Record<string, string> = {
  keyword_in_title: "کلمه کلیدی در عنوان صفحه",
  keyword_in_description: "کلمه کلیدی در Meta Description",
  keyword_in_path: "کلمه کلیدی در URL",
  keyword_in_h2: "کلمه کلیدی در H2",
  has_meta_title: "Meta title تنظیم شده",
  has_meta_description: "Meta description تنظیم شده",
  title_length_ok: "طول عنوان مناسب است",
  description_length_ok: "طول توضیحات مناسب است",
  single_h1_or_template_h1: "ساختار H1 صحیح است",
  word_count_adequate: "حجم محتوا حداقل ۳۰۰ کلمه",
  images_have_alt: "تصاویر Alt دارند",
  has_internal_links: "حداقل یک لینک داخلی وجود دارد",
};

export default function SeoPanel({ entryId, pageTitle, pagePath }: Props) {
  const [meta, setMeta] = useState<SeoMeta>(() => emptyMeta(entryId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<Paginated<SeoMeta>>(`/seo/meta/?entry=${encodeURIComponent(entryId)}`)
      .then((data) => {
        if (cancelled) return;
        setMeta(data.results[0] || emptyMeta(entryId));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "خطا در بارگذاری SEO");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [entryId]);

  const previewTitle = meta.title || pageTitle || "عنوان صفحه";
  const previewDescription = meta.description || "توضیحات متا هنوز نوشته نشده است.";
  const previewPath = pagePath || "/";
  const titleLength = meta.title.length;
  const descriptionLength = meta.description.length;
  const secondaryText = useMemo(() => meta.secondary_keywords.join(", "), [meta.secondary_keywords]);

  function patch<K extends keyof SeoMeta>(key: K, value: SeoMeta[K]) {
    setMeta((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const payload = writablePayload(meta, entryId);
      const result = meta.id
        ? await apiFetch<SeoMeta>(`/seo/meta/${meta.id}/`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch<SeoMeta>("/seo/meta/", { method: "POST", body: JSON.stringify(payload) });
      setMeta((current) => ({ ...current, ...result }));
      setMessage("تنظیمات SEO ذخیره شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره SEO");
    } finally {
      setSaving(false);
    }
  }

  async function analyze() {
    setMessage("");
    let id = meta.id;
    if (!id) {
      const created = await apiFetch<SeoMeta>("/seo/meta/", {
        method: "POST",
        body: JSON.stringify(writablePayload(meta, entryId)),
      });
      id = created.id;
      setMeta((current) => ({ ...current, ...created }));
    }
    if (!id) return;
    try {
      const analysis = await apiFetch<any>(`/seo/meta/${id}/analyze/`, { method: "POST", body: "{}" });
      setMeta((current) => ({ ...current, seo_score: analysis.score || 0, analysis }));
      setMessage("تحلیل SEO به‌روزرسانی شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در تحلیل SEO");
    }
  }

  if (loading) return <div className="seoPanel panel">در حال بارگذاری تنظیمات SEO...</div>;

  const checks = meta.analysis?.checks || {};
  const metrics = meta.analysis?.metrics || {};

  return (
    <section className="seoPanel panel">
      <div className="seoPanelHeader">
        <div>
          <h2>SEO</h2>
          <p>تنظیمات موتور جستجو و تحلیل محتوای این صفحه</p>
        </div>
        <div className={`seoScore ${meta.seo_score >= 70 ? "good" : meta.seo_score >= 40 ? "medium" : "low"}`}>
          <strong>{meta.seo_score || 0}</strong>
          <span>/100</span>
        </div>
      </div>

      {message && <div className={message.includes("شد") ? "notice" : "error"}>{message}</div>}

      <div className="snippetPreview" dir="ltr">
        <span className="snippetUrl">example.com{previewPath}</span>
        <strong>{previewTitle}</strong>
        <p>{previewDescription}</p>
      </div>

      <div className="seoFields">
        <div className="field full">
          <label>Focus keyword</label>
          <input value={meta.focus_keyword} onChange={(e) => patch("focus_keyword", e.target.value)} placeholder="کلمه کلیدی اصلی صفحه" />
        </div>
        <div className="field full">
          <label>SEO title <span className={titleLength >= 30 && titleLength <= 65 ? "lengthOk" : "lengthHint"}>{titleLength}/65</span></label>
          <input value={meta.title} onChange={(e) => patch("title", e.target.value)} placeholder={pageTitle} />
        </div>
        <div className="field full">
          <label>Meta description <span className={descriptionLength >= 80 && descriptionLength <= 180 ? "lengthOk" : "lengthHint"}>{descriptionLength}/180</span></label>
          <textarea value={meta.description} onChange={(e) => patch("description", e.target.value)} placeholder="توضیح جذاب و دقیق برای نتیجه جستجو..." />
        </div>
        <div className="field full">
          <label>Secondary keywords</label>
          <input value={secondaryText} onChange={(e) => patch("secondary_keywords", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} placeholder="keyword 2, keyword 3" />
        </div>
      </div>

      <button type="button" className="seoAdvancedToggle" onClick={() => setAdvanced((value) => !value)}>
        {advanced ? "−" : "+"} تنظیمات پیشرفته
      </button>

      {advanced && (
        <div className="seoFields seoAdvanced">
          <div className="field full">
            <label>Canonical URL</label>
            <input dir="ltr" value={meta.canonical_url} onChange={(e) => patch("canonical_url", e.target.value)} placeholder="https://example.com/path" />
          </div>
          <label className="seoCheck"><input type="checkbox" checked={meta.robots_index} onChange={(e) => patch("robots_index", e.target.checked)} /> Index</label>
          <label className="seoCheck"><input type="checkbox" checked={meta.robots_follow} onChange={(e) => patch("robots_follow", e.target.checked)} /> Follow</label>
          <div className="field">
            <label>OG title</label>
            <input value={meta.og_title} onChange={(e) => patch("og_title", e.target.value)} />
          </div>
          <div className="field">
            <label>Twitter card</label>
            <select value={meta.twitter_card} onChange={(e) => patch("twitter_card", e.target.value)}>
              <option value="summary_large_image">summary_large_image</option>
              <option value="summary">summary</option>
            </select>
          </div>
          <div className="field full">
            <label>OG description</label>
            <textarea value={meta.og_description} onChange={(e) => patch("og_description", e.target.value)} />
          </div>
          <div className="field full">
            <label>OG image</label>
            <input dir="ltr" value={meta.og_image} onChange={(e) => patch("og_image", e.target.value)} placeholder="https://..." />
          </div>
        </div>
      )}

      {Object.keys(checks).length > 0 && (
        <div className="seoAnalysis">
          <h3>تحلیل محتوا</h3>
          <div className="seoCheckList">
            {Object.entries(checks).map(([key, passed]) => (
              <div className={passed ? "passed" : "failed"} key={key}>
                <span>{passed ? "✓" : "!"}</span>
                <p>{labels[key] || key}</p>
              </div>
            ))}
          </div>
          {Object.keys(metrics).length > 0 && (
            <div className="seoMetrics">
              {Object.entries(metrics).map(([key, value]) => <span key={key}><strong>{value}</strong> {key.replaceAll("_", " ")}</span>)}
            </div>
          )}
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn" disabled={saving} onClick={save}>{saving ? "در حال ذخیره..." : "ذخیره SEO"}</button>
        <button type="button" className="btn secondary" onClick={analyze}>تحلیل مجدد</button>
      </div>
    </section>
  );
}
