"use client";

import { useEffect, useState } from "react";
import { apiFetch, Paginated } from "@/lib/api";
import type { ContentBlock } from "@/components/BlockEditor";

type Reusable = { id: string; name: string; key: string; block: ContentBlock; site: string };
type Props = { siteId: string; open: boolean; onClose: () => void; onSelect: (block: ContentBlock) => void };

export default function ReusableBlockPicker({ siteId, open, onClose, onSelect }: Props) {
  const [rows, setRows] = useState<Reusable[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !siteId) return;
    let active = true;
    setLoading(true); setError("");
    const params = new URLSearchParams({ site: siteId, page: String(page) });
    if (search.trim()) params.set("search", search.trim());
    const timer = setTimeout(() => {
      apiFetch<Paginated<Reusable>>(`/content/reusable-blocks/?${params}`)
        .then((data) => {
          if (!active) return;
          setRows(data.results); setHasNext(Boolean(data.next));
        }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "دریافت بلوک‌ها ناموفق بود"); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [siteId, open, page, search]);

  if (!open) return null;
  return <div className="cmsReusableBackdrop" role="presentation" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="کتابخانه بلوک‌های آماده"
      className="cmsReusableDialog" onClick={(event) => event.stopPropagation()}>
      <header className="cmsReusableDialogHead"><div><h2>درج بلوک آماده</h2><p>انتخاب یک نسخه کپی‌شده؛ تغییرات بعدی بلوک اصلی را تغییر نمی‌دهد.</p></div>
        <button type="button" className="btn secondary small" onClick={onClose}>بستن</button></header>
      <input aria-label="جستجوی بلوک آماده" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="جستجوی نام بلوک..." />
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p role="status">در حال بارگذاری...</p> : rows.length ? <div className="cmsReusableChoices">
        {rows.map((item) => <button type="button" className="cmsReusableChoice" key={item.id}
          onClick={() => {
            if (item.block && typeof item.block === "object" && item.block.type && item.block.data) onSelect(item.block);
          }}>
          <strong>{item.name}</strong><span dir="ltr">{item.key}</span><small>{item.block?.type || "unknown"}</small>
        </button>)}</div> : <p className="cmsReusableEmpty">بلوک آماده‌ای پیدا نشد. ابتدا در بخش «بلوک‌های آماده» یک بلوک بسازید.</p>}
      <footer className="cmsReusableFooter">
        <button type="button" className="btn secondary small" onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={loading || page <= 1}>قبلی</button>
        <span>صفحه {page.toLocaleString("fa-IR")}</span>
        <button type="button" className="btn secondary small" onClick={() => setPage((n) => n + 1)} disabled={loading || !hasNext}>بعدی</button>
      </footer>
    </section>
  </div>;
}
