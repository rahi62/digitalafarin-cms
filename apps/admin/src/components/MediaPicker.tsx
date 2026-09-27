"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, Paginated } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";

export type MediaAsset = {
  id: string; site: string; url: string | null; filename: string; mime_type: string;
  alt_text: string; caption: string; folder: string; width: number | null;
  height: number | null; size_bytes: number;
};

type Props = {
  siteId?: string;
  open: boolean;
  imageOnly?: boolean;
  selectedUrl?: string;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
};

export default function MediaPicker({
  siteId, open, imageOnly = true, selectedUrl = "", onClose, onSelect,
}: Props) {
  const [rows, setRows] = useState<MediaAsset[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const pageSize = 30;

  useEffect(() => {
    if (!open) {
      setSearch("");
      setFolder("");
      setPage(1);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !siteId) return;
    let cancelled = false;
    apiFetch<{ results: string[] }>(`/media/assets/folders/?site=${encodeURIComponent(siteId)}`)
      .then((data) => { if (!cancelled) setFolders(data.results); })
      .catch(() => { if (!cancelled) setFolders([]); });
    return () => { cancelled = true; };
  }, [open, siteId]);

  useEffect(() => {
    if (!open || !siteId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setMessage("");
      const params = new URLSearchParams({
        site: siteId,
        page: String(page),
        page_size: String(pageSize),
        ordering: "-created_at",
      });
      if (imageOnly) params.set("type", "images");
      if (search.trim()) params.set("search", search.trim());
      if (folder) params.set("folder", folder);

      apiFetch<Paginated<MediaAsset>>(`/media/assets/?${params.toString()}`)
        .then((data) => {
          if (!cancelled) {
            setRows(data.results);
            setCount(data.count);
          }
        })
        .catch((error) => {
          if (!cancelled) setMessage(error instanceof Error ? error.message : "خطا در بارگذاری رسانه‌ها");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, siteId, imageOnly, search, folder, page]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  if (!open) return null;

  return (
    <div className="mediaPickerBackdrop" role="dialog" aria-modal="true" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="mediaPickerModal">
        <div className="mediaPickerHeader">
          <div>
            <strong>انتخاب رسانه</strong>
            <span>{imageOnly ? "یک تصویر از کتابخانه رسانه انتخاب کنید" : "یک فایل انتخاب کنید"}</span>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        {!siteId ? <div className="error">ابتدا سایت محتوا را انتخاب کنید.</div> : <>
          <div className="mediaPickerToolbar">
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="جستجو در نام، Alt یا Caption..." />
            <select value={folder} onChange={(event) => { setFolder(event.target.value); setPage(1); }}>
              <option value="">همه پوشه‌ها</option>
              {folders.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <Link href={adminPath("/media")} className="btn secondary small" target="_blank">مدیریت رسانه‌ها ↗</Link>
          </div>

          {message && <div className="error">{message}</div>}
          {loading ? <div className="mediaPickerEmpty">در حال بارگذاری...</div> :
            rows.length === 0 ? <div className="mediaPickerEmpty">رسانه مناسبی پیدا نشد.</div> :
            <div className="mediaPickerGrid">{rows.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className={`mediaPickerCard ${asset.url === selectedUrl ? "selected" : ""}`}
                onClick={() => { onSelect(asset); onClose(); }}
              >
                <div className="mediaPickerThumb">
                  {asset.url && asset.mime_type?.startsWith("image/") ? <img src={asset.url} alt={asset.alt_text || asset.filename} /> : <span>FILE</span>}
                </div>
                <strong title={asset.filename}>{asset.filename || "بدون نام"}</strong>
                <span>{asset.alt_text || "Alt ندارد"}</span>
                {asset.width && asset.height && <small>{asset.width} × {asset.height}</small>}
              </button>
            ))}</div>}

          {count > pageSize && <div className="mediaPickerPagination">
            <button type="button" className="btn secondary small" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>قبلی</button>
            <span>صفحه {page} از {totalPages}</span>
            <button type="button" className="btn secondary small" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>بعدی</button>
          </div>}
        </>}

        <div className="mediaPickerFooter">
          <span>{count} فایل قابل انتخاب</span>
          <button type="button" className="btn secondary" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
