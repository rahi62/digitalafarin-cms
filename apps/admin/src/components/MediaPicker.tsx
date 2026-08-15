"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, Paginated } from "@/lib/api";

export type MediaAsset = {
  id: string;
  site: string;
  url: string | null;
  filename: string;
  mime_type: string;
  alt_text: string;
  caption: string;
  folder: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
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
  siteId,
  open,
  imageOnly = true,
  selectedUrl = "",
  onClose,
  onSelect,
}: Props) {
  const [rows, setRows] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !siteId) return;
    let cancelled = false;
    setLoading(true);
    setMessage("");
    apiFetch<Paginated<MediaAsset>>(`/media/assets/?site=${encodeURIComponent(siteId)}`)
      .then((data) => {
        if (!cancelled) setRows(data.results);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "خطا در بارگذاری رسانه‌ها");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, siteId]);

  const folders = useMemo(
    () => Array.from(new Set(rows.map((item) => item.folder).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((asset) => {
      if (imageOnly && !asset.mime_type?.startsWith("image/")) return false;
      if (folder && asset.folder !== folder) return false;
      if (!query) return true;
      return [asset.filename, asset.alt_text, asset.caption, asset.folder]
        .some((value) => (value || "").toLowerCase().includes(query));
    });
  }, [rows, search, folder, imageOnly]);

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

        {!siteId ? (
          <div className="error">ابتدا سایت محتوا را انتخاب کنید.</div>
        ) : (
          <>
            <div className="mediaPickerToolbar">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجو در نام، Alt یا Caption..." />
              <select value={folder} onChange={(event) => setFolder(event.target.value)}>
                <option value="">همه پوشه‌ها</option>
                {folders.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <Link href="/media" className="btn secondary small" target="_blank">مدیریت رسانه‌ها ↗</Link>
            </div>

            {message && <div className="error">{message}</div>}
            {loading ? (
              <div className="mediaPickerEmpty">در حال بارگذاری...</div>
            ) : filtered.length === 0 ? (
              <div className="mediaPickerEmpty">رسانه مناسبی پیدا نشد.</div>
            ) : (
              <div className="mediaPickerGrid">
                {filtered.map((asset) => (
                  <button
                    type="button"
                    key={asset.id}
                    className={`mediaPickerCard ${asset.url === selectedUrl ? "selected" : ""}`}
                    onClick={() => { onSelect(asset); onClose(); }}
                  >
                    <div className="mediaPickerThumb">
                      {asset.url && asset.mime_type?.startsWith("image/")
                        ? <img src={asset.url} alt={asset.alt_text || asset.filename} />
                        : <span>FILE</span>}
                    </div>
                    <strong title={asset.filename}>{asset.filename || "بدون نام"}</strong>
                    <span>{asset.alt_text || "Alt ندارد"}</span>
                    {asset.width && asset.height && <small>{asset.width} × {asset.height}</small>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mediaPickerFooter">
          <span>{filtered.length} فایل قابل انتخاب</span>
          <button type="button" className="btn secondary" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
