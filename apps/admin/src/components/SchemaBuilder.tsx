"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, Paginated } from "@/lib/api";

type SchemaRow = {
  id: string;
  entry: string;
  entry_title?: string;
  schema_type: string;
  data: Record<string, any>;
  is_active: boolean;
};

type Block = { type?: string; data?: Record<string, any> };

type Props = {
  entryId: string;
  pageTitle: string;
  pagePath: string;
  blocks: Block[];
};

const schemaTypes = [
  "Article",
  "BlogPosting",
  "WebPage",
  "FAQPage",
  "BreadcrumbList",
  "Organization",
  "LocalBusiness",
  "Product",
  "Service",
  "Person",
  "HowTo",
  "VideoObject",
  "Custom",
];

function faqEntities(blocks: Block[]) {
  const faqBlock = blocks.find((block) => block?.type === "faq");
  const items = Array.isArray(faqBlock?.data?.items) ? faqBlock?.data?.items : [];
  return items
    .filter((item: any) => item?.question && item?.answer)
    .map((item: any) => ({
      "@type": "Question",
      name: String(item.question),
      acceptedAnswer: { "@type": "Answer", text: String(item.answer) },
    }));
}

function templateFor(type: string, title: string, path: string, blocks: Block[]) {
  if (type === "FAQPage") {
    return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqEntities(blocks) };
  }
  if (type === "BreadcrumbList") {
    return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [] };
  }
  if (type === "Article" || type === "BlogPosting") {
    return {
      "@context": "https://schema.org",
      "@type": type,
      headline: title,
      description: "",
      image: "",
      mainEntityOfPage: path,
      author: { "@type": "Person", name: "" },
    };
  }
  if (type === "VideoObject") {
    return {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: title,
      description: "",
      thumbnailUrl: "",
      uploadDate: "",
      contentUrl: "",
    };
  }
  if (type === "HowTo") {
    return { "@context": "https://schema.org", "@type": "HowTo", name: title, description: "", step: [] };
  }
  if (type === "Custom") {
    return { "@context": "https://schema.org", "@type": "Thing", name: title };
  }
  return {
    "@context": "https://schema.org",
    "@type": type,
    name: title,
    description: "",
    url: "",
    image: "",
  };
}

export default function SchemaBuilder({ entryId, pageTitle, pagePath, blocks }: Props) {
  const [rows, setRows] = useState<SchemaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingType, setCreatingType] = useState("Article");
  const [message, setMessage] = useState("");
  const [jsonOpen, setJsonOpen] = useState<Record<string, boolean>>({});
  const [jsonDraft, setJsonDraft] = useState<Record<string, string>>({});
  const [jsonError, setJsonError] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<SchemaRow>>(`/seo/schemas/?entry=${encodeURIComponent(entryId)}`);
      setRows(data.results);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری Schema");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [entryId]);

  const faqCount = useMemo(() => faqEntities(blocks).length, [blocks]);

  function patchRow(id: string, patch: Partial<SchemaRow>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function patchData(id: string, key: string, value: any) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, data: { ...row.data, [key]: value } } : row));
  }

  async function createSchema() {
    setMessage("");
    try {
      const created = await apiFetch<SchemaRow>("/seo/schemas/", {
        method: "POST",
        body: JSON.stringify({
          entry: entryId,
          schema_type: creatingType,
          data: templateFor(creatingType, pageTitle, pagePath, blocks),
          is_active: true,
        }),
      });
      setRows((current) => [...current, created]);
      setMessage("Schema اضافه شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ساخت Schema");
    }
  }

  async function saveRow(row: SchemaRow) {
    setMessage("");
    try {
      const saved = await apiFetch<SchemaRow>(`/seo/schemas/${row.id}/`, {
        method: "PUT",
        body: JSON.stringify({
          entry: entryId,
          schema_type: row.schema_type,
          data: row.data,
          is_active: row.is_active,
        }),
      });
      patchRow(row.id, saved);
      setMessage("Schema ذخیره شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره Schema");
    }
  }

  async function removeRow(row: SchemaRow) {
    if (!window.confirm(`Schema ${row.schema_type} حذف شود؟`)) return;
    try {
      await apiFetch(`/seo/schemas/${row.id}/`, { method: "DELETE" });
      setRows((current) => current.filter((item) => item.id !== row.id));
      setMessage("Schema حذف شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در حذف Schema");
    }
  }

  function openJson(row: SchemaRow) {
    setJsonDraft((current) => ({ ...current, [row.id]: JSON.stringify(row.data, null, 2) }));
    setJsonError((current) => ({ ...current, [row.id]: "" }));
    setJsonOpen((current) => ({ ...current, [row.id]: !current[row.id] }));
  }

  function applyJson(row: SchemaRow) {
    try {
      const parsed = JSON.parse(jsonDraft[row.id] || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Schema data باید object باشد");
      patchRow(row.id, { data: parsed });
      setJsonError((current) => ({ ...current, [row.id]: "" }));
    } catch (error) {
      setJsonError((current) => ({ ...current, [row.id]: error instanceof Error ? error.message : "JSON نامعتبر است" }));
    }
  }

  function regenerateFaq(row: SchemaRow) {
    patchRow(row.id, { data: { ...row.data, "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqEntities(blocks) } });
    setMessage(`${faqCount} سوال از Block Editor به Schema منتقل شد`);
  }

  if (loading) return <section className="panel schemaBuilder">در حال بارگذاری Schema...</section>;

  return (
    <section className="panel schemaBuilder">
      <div className="schemaHeader">
        <div>
          <h2>Schema Builder</h2>
          <p>Structured Data صفحه را بدون نوشتن JSON-LD از صفر مدیریت کنید.</p>
        </div>
        <div className="schemaCreate">
          <select value={creatingType} onChange={(e) => setCreatingType(e.target.value)}>
            {schemaTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" className="btn" onClick={createSchema}>+ افزودن</button>
        </div>
      </div>

      {message && <div className={message.includes("خطا") ? "error" : "notice"}>{message}</div>}

      {rows.length === 0 && <div className="emptyState">هنوز Schema برای این صفحه تعریف نشده است.</div>}

      <div className="schemaList">
        {rows.map((row) => {
          const topField = row.schema_type === "Article" || row.schema_type === "BlogPosting" ? "headline" : "name";
          return (
            <article className="schemaCard" key={row.id}>
              <div className="schemaCardHeader">
                <div>
                  <strong>{row.schema_type}</strong>
                  <span className={row.is_active ? "schemaActive" : "schemaInactive"}>{row.is_active ? "Active" : "Inactive"}</span>
                </div>
                <label className="toggleRow">
                  <input type="checkbox" checked={row.is_active} onChange={(e) => patchRow(row.id, { is_active: e.target.checked })} />
                  فعال
                </label>
              </div>

              <div className="schemaFields">
                <div className="field">
                  <label>Schema type</label>
                  <select value={row.schema_type} onChange={(e) => {
                    const type = e.target.value;
                    patchRow(row.id, { schema_type: type, data: templateFor(type, pageTitle, pagePath, blocks) });
                  }}>
                    {schemaTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>{topField === "headline" ? "Headline" : "Name"}</label>
                  <input value={String(row.data?.[topField] || "")} onChange={(e) => patchData(row.id, topField, e.target.value)} />
                </div>
                {!["FAQPage", "BreadcrumbList", "Custom"].includes(row.schema_type) && (
                  <div className="field full">
                    <label>Description</label>
                    <textarea value={String(row.data?.description || "")} onChange={(e) => patchData(row.id, "description", e.target.value)} />
                  </div>
                )}
                {["Organization", "LocalBusiness", "Product", "Service", "Person", "WebPage"].includes(row.schema_type) && (
                  <>
                    <div className="field"><label>URL</label><input dir="ltr" value={String(row.data?.url || "")} onChange={(e) => patchData(row.id, "url", e.target.value)} /></div>
                    <div className="field"><label>Image</label><input dir="ltr" value={String(row.data?.image || "")} onChange={(e) => patchData(row.id, "image", e.target.value)} /></div>
                  </>
                )}
                {row.schema_type === "VideoObject" && (
                  <>
                    <div className="field"><label>Thumbnail URL</label><input dir="ltr" value={String(row.data?.thumbnailUrl || "")} onChange={(e) => patchData(row.id, "thumbnailUrl", e.target.value)} /></div>
                    <div className="field"><label>Content URL</label><input dir="ltr" value={String(row.data?.contentUrl || "")} onChange={(e) => patchData(row.id, "contentUrl", e.target.value)} /></div>
                    <div className="field"><label>Upload date</label><input type="date" value={String(row.data?.uploadDate || "")} onChange={(e) => patchData(row.id, "uploadDate", e.target.value)} /></div>
                  </>
                )}
              </div>

              {row.schema_type === "FAQPage" && (
                <div className="faqSchemaSync">
                  <div><strong>{faqCount}</strong><span>FAQ معتبر در Block Editor</span></div>
                  <button type="button" className="btn secondary" onClick={() => regenerateFaq(row)}>Sync from FAQ block</button>
                </div>
              )}

              <button type="button" className="schemaJsonToggle" onClick={() => openJson(row)}>
                {jsonOpen[row.id] ? "−" : "+"} JSON-LD پیشرفته
              </button>
              {jsonOpen[row.id] && (
                <div className="schemaJsonEditor">
                  {jsonError[row.id] && <div className="error">{jsonError[row.id]}</div>}
                  <textarea dir="ltr" value={jsonDraft[row.id] ?? JSON.stringify(row.data, null, 2)} onChange={(e) => setJsonDraft((current) => ({ ...current, [row.id]: e.target.value }))} />
                  <button type="button" className="btn secondary small" onClick={() => applyJson(row)}>اعمال JSON</button>
                </div>
              )}

              <div className="schemaCardActions">
                <button type="button" className="btn" onClick={() => saveRow(row)}>ذخیره Schema</button>
                <button type="button" className="btn dangerBtn" onClick={() => removeRow(row)}>حذف</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
