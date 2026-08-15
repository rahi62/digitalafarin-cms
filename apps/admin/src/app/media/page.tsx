"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string; domain: string };
type Asset = {
  id: string;
  site: string;
  file: string;
  url: string | null;
  filename: string;
  mime_type: string;
  alt_text: string;
  caption: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
  folder: string;
  created_at: string;
};

function sizeLabel(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MediaPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Asset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadAssets(siteId = site) {
    if (!siteId) return;
    try {
      const data = await apiFetch<Paginated<Asset>>(`/media/assets/?site=${encodeURIComponent(siteId)}`);
      setAssets(data.results);
      if (selected) setSelected(data.results.find((item) => item.id === selected.id) || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری رسانه‌ها");
    }
  }

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/").then((data) => {
      setSites(data.results);
      if (data.results[0]) setSite(data.results[0].id);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری سایت‌ها"));
  }, []);

  useEffect(() => { if (site) loadAssets(site); }, [site]);

  const folders = useMemo(() => Array.from(new Set(assets.map((asset) => asset.folder).filter(Boolean))).sort(), [assets]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (folder && asset.folder !== folder) return false;
      if (!query) return true;
      return [asset.filename, asset.alt_text, asset.caption, asset.folder].some((value) => (value || "").toLowerCase().includes(query));
    });
  }, [assets, search, folder]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!site || !file) {
      setMessage("سایت و فایل را انتخاب کنید");
      return;
    }
    setUploading(true);
    setMessage("");
    const data = new FormData();
    data.append("site", site);
    data.append("file", file);
    data.append("folder", uploadFolder.trim());
    data.append("alt_text", uploadAlt.trim());
    try {
      await apiFetch<Asset>("/media/assets/", { method: "POST", body: data });
      if (fileRef.current) fileRef.current.value = "";
      setUploadAlt("");
      setMessage("فایل آپلود شد");
      await loadAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در آپلود فایل");
    } finally {
      setUploading(false);
    }
  }

  async function saveAsset(asset: Asset) {
    try {
      const updated = await apiFetch<Asset>(`/media/assets/${asset.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ alt_text: asset.alt_text, caption: asset.caption, folder: asset.folder }),
      });
      setAssets((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected(updated);
      setMessage("اطلاعات رسانه ذخیره شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره رسانه");
    }
  }

  async function removeAsset(asset: Asset) {
    if (!window.confirm(`فایل ${asset.filename} حذف شود؟`)) return;
    try {
      await apiFetch(`/media/assets/${asset.id}/`, { method: "DELETE" });
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setSelected(null);
      setMessage("فایل حذف شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در حذف فایل");
    }
  }

  return (
    <>
      <PageHeader title="کتابخانه رسانه" description="آپلود و مدیریت تصاویر و فایل‌های CMS" />
      {message && <div className={message.includes("خطا") || message.includes("انتخاب") ? "error" : "notice"}>{message}</div>}

      <div className="mediaLayout">
        <div className="mediaMain">
          <form className="panel mediaUpload" onSubmit={upload}>
            <div className="mediaUploadHeader"><h2>آپلود فایل</h2><span>تصویر، PDF و سایر فایل‌های مجاز پروژه</span></div>
            <div className="mediaUploadFields">
              <div className="field"><label>سایت</label><select value={site} onChange={(e) => setSite(e.target.value)}>{sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}</select></div>
              <div className="field"><label>فایل</label><input ref={fileRef} type="file" /></div>
              <div className="field"><label>Folder</label><input value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} placeholder="blog/2026" /></div>
              <div className="field"><label>Alt text</label><input value={uploadAlt} onChange={(e) => setUploadAlt(e.target.value)} placeholder="توضیح تصویر برای SEO" /></div>
            </div>
            <button className="btn" disabled={uploading}>{uploading ? "در حال آپلود..." : "آپلود"}</button>
          </form>

          <div className="panel mediaLibrary">
            <div className="mediaToolbar">
              <div><h2>فایل‌ها</h2><span>{filtered.length} از {assets.length}</span></div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو در نام، alt، caption..." />
              <select value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">همه پوشه‌ها</option>{folders.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            </div>

            {filtered.length === 0 ? <div className="emptyState">رسانه‌ای برای نمایش وجود ندارد.</div> : (
              <div className="mediaGrid">
                {filtered.map((asset) => (
                  <button type="button" className={`mediaCard ${selected?.id === asset.id ? "selected" : ""}`} key={asset.id} onClick={() => setSelected(asset)}>
                    <div className="mediaThumb">
                      {asset.url && asset.mime_type?.startsWith("image/") ? <img src={asset.url} alt={asset.alt_text || asset.filename} /> : <span>{asset.mime_type?.includes("pdf") ? "PDF" : "FILE"}</span>}
                    </div>
                    <strong title={asset.filename}>{asset.filename || "بدون نام"}</strong>
                    <small>{sizeLabel(asset.size_bytes)}{asset.folder ? ` · ${asset.folder}` : ""}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="panel mediaDetails">
          {!selected ? <div className="emptyState">یک فایل را برای مشاهده جزئیات انتخاب کنید.</div> : (
            <>
              <div className="mediaDetailPreview">{selected.url && selected.mime_type?.startsWith("image/") ? <img src={selected.url} alt={selected.alt_text || selected.filename} /> : <span>{selected.mime_type || "File"}</span>}</div>
              <div className="mediaDetailMeta"><strong>{selected.filename}</strong><span>{selected.mime_type || "—"} · {sizeLabel(selected.size_bytes)}</span>{selected.width && selected.height && <span>{selected.width} × {selected.height}</span>}</div>
              <div className="field"><label>Alt text</label><input value={selected.alt_text || ""} onChange={(e) => setSelected({ ...selected, alt_text: e.target.value })} /></div>
              <div className="field"><label>Caption</label><textarea value={selected.caption || ""} onChange={(e) => setSelected({ ...selected, caption: e.target.value })} /></div>
              <div className="field"><label>Folder</label><input value={selected.folder || ""} onChange={(e) => setSelected({ ...selected, folder: e.target.value })} /></div>
              <div className="field"><label>URL</label><input dir="ltr" readOnly value={selected.url || ""} onFocus={(e) => e.currentTarget.select()} /></div>
              <div className="mediaDetailActions"><button type="button" className="btn" onClick={() => saveAsset(selected)}>ذخیره</button><button type="button" className="btn dangerBtn" onClick={() => removeAsset(selected)}>حذف</button></div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
