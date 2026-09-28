"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { ContentBlock } from "@/components/BlockEditor";
import ProfessionalEditor from "@/components/ProfessionalEditor";
import CustomFieldsEditor, { ContentTypeSchema } from "@/components/CustomFieldsEditor";
import EditorialWorkflowPanel from "@/components/EditorialWorkflowPanel";
import InternalLinksPanel from "@/components/InternalLinksPanel";
import PageHeader from "@/components/PageHeader";
import ParentEntryField from "@/components/ParentEntryField";
import RevisionPanel from "@/components/RevisionPanel";
import SchemaBuilder from "@/components/SchemaBuilder";
import SeoPanel from "@/components/SeoPanel";
import TaxonomyFields from "@/components/TaxonomyFields";
import ContentPathFields, { ContentRouting } from "@/components/ContentPathFields";
import { apiFetch } from "@/lib/api";

type ContentType = ContentRouting & { id: string; name: string; slug: string; schema: ContentTypeSchema };

export default function EditContent() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<any>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [msg, setMsg] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [recoveryDraft, setRecoveryDraft] = useState<any>(null);
  const lastSavedFingerprint = useRef("");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  function normalizeEntry(entry: any) {
    return {
      ...entry,
      categories: entry.categories || [],
      tags: entry.tags || [],
      custom_fields: entry.custom_fields || {},
      blocks: (entry.blocks || []) as ContentBlock[],
    };
  }

  function payloadFor(entry: any) {
    const body = { ...entry };
    delete body.author;
    delete body.author_name;
    delete body.content_type_slug;
    delete body.created_at;
    delete body.updated_at;
    delete body.published_at;
    return body;
  }

  function fingerprint(entry: any) {
    return JSON.stringify(payloadFor(entry));
  }

  function draftStorageKey() {
    return `digitalafarin-cms:draft:${id}`;
  }

  function cancelAutosaveTimer() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    apiFetch<any>(`/content/entries/${id}/`).then(async (d) => {
      if (cancelled) return;
      const normalized = normalizeEntry(d);
      lastSavedFingerprint.current = fingerprint(normalized);

      try {
        const rawDraft = window.localStorage.getItem(draftStorageKey());
        if (rawDraft) {
          const parsedDraft = JSON.parse(rawDraft) as { payload?: Record<string, unknown> };
          if (parsedDraft.payload) {
            const recovered = normalizeEntry({ ...normalized, ...parsedDraft.payload });
            if (fingerprint(recovered) !== fingerprint(normalized)) {
              setRecoveryDraft(recovered);
            }
          }
        }
      } catch {
        window.localStorage.removeItem(draftStorageKey());
      }

      setF(normalized);
      setSaveState("saved");
      try {
        const type = await apiFetch<ContentType>(`/content/types/${d.content_type}/`);
        if (!cancelled) setContentType(type);
      } catch (error) {
        if (!cancelled) setMsg(error instanceof Error ? error.message : "خطا در بارگذاری Content Type");
      }
    }).catch((error) => {
      if (!cancelled) setMsg(error instanceof Error ? error.message : "خطا در بارگذاری محتوا");
    });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!f) return;
    const currentFingerprint = fingerprint(f);
    if (currentFingerprint === lastSavedFingerprint.current) return;

    try {
      window.localStorage.setItem(draftStorageKey(), JSON.stringify({
        savedAt: Date.now(),
        payload: payloadFor(f),
      }));
    } catch {
      // local recovery is best-effort; server autosave remains authoritative
    }
  }, [f, id]);

  useEffect(() => {
    if (!f) return;

    const currentFingerprint = fingerprint(f);
    if (currentFingerprint === lastSavedFingerprint.current) {
      if (saveState !== "saving") setSaveState("saved");
      return;
    }

    setSaveState("dirty");
    cancelAutosaveTimer();
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      void saveEntry(false, f).catch(() => undefined);
    }, 2500);

    return cancelAutosaveTimer;
  }, [f, id]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!f) return;
      const hasUnsavedChanges = fingerprint(f) !== lastSavedFingerprint.current || saveState === "saving";
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [f, saveState]);

  function saveEntry(showMessage = true, entrySnapshot = f) {
    if (!entrySnapshot) return Promise.resolve(null);

    const body = payloadFor(entrySnapshot);
    const submittedFingerprint = JSON.stringify(body);
    setSaveState("saving");

    const operation = saveQueue.current
      .catch(() => undefined)
      .then(() => apiFetch<any>(`/content/entries/${id}/`, {
        method: "PUT",
        body: JSON.stringify(body),
      }))
      .then((saved) => {
        const normalized = normalizeEntry(saved);
        lastSavedFingerprint.current = fingerprint(normalized);
        setF((current: any) => {
          if (!current || fingerprint(current) === submittedFingerprint) {
            setSaveState("saved");
            setRecoveryDraft(null);
            try { window.localStorage.removeItem(draftStorageKey()); } catch {}
            return normalized;
          }
          setSaveState("dirty");
          return current;
        });
        if (showMessage) setMsg("ذخیره شد");
        return saved;
      })
      .catch((error) => {
        setSaveState("error");
        throw error;
      });

    saveQueue.current = operation;
    return operation;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    cancelAutosaveTimer();
    try {
      await saveEntry(true);
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function preview() {
    setPreviewing(true);
    setMsg("");
    try {
      cancelAutosaveTimer();
      await saveEntry(false);
      const data = await apiFetch<{ frontend_url: string; expires_in: number }>(`/content/entries/${id}/preview/`, { method: "POST", body: "{}" });
      window.open(data.frontend_url, "_blank", "noopener,noreferrer");
      setMsg(`پیش‌نمایش امن برای ${Math.round(data.expires_in / 60)} دقیقه ساخته شد`);
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setPreviewing(false);
    }
  }

  if (!f) return <div>{msg || "در حال بارگذاری..."}</div>;

  return (
    <>
      <PageHeader
        title={`ویرایش: ${f.title}`}
        description={`${f.path}${contentType ? ` · ${contentType.name}` : ""}`}
        action={<div className="contentHeaderActions"><span className={`autosaveStatus ${saveState}`}>{
          saveState === "saving" ? "در حال ذخیره..." :
          saveState === "dirty" ? "تغییرات ذخیره‌نشده" :
          saveState === "error" ? "خطا در ذخیره خودکار" :
          "ذخیره شد"
        }</span><button type="button" className="btn secondary" onClick={preview} disabled={previewing}>{previewing ? "در حال ساخت..." : "پیش‌نمایش"}</button></div>}
      />
      <form className="form" onSubmit={submit}>
        {recoveryDraft && (
          <div className="recoveryNotice">
            <div>
              <strong>تغییرات ذخیره‌نشده پیدا شد</strong>
              <span>یک نسخه محلی از این نوشته قبل از آخرین ذخیره روی سرور باقی مانده است.</span>
            </div>
            <div>
              <button type="button" className="btn small" onClick={() => {
                setF(recoveryDraft);
                setRecoveryDraft(null);
                setSaveState("dirty");
              }}>بازیابی تغییرات</button>
              <button type="button" className="btn secondary small" onClick={() => {
                try { window.localStorage.removeItem(draftStorageKey()); } catch {}
                setRecoveryDraft(null);
              }}>نادیده گرفتن</button>
            </div>
          </div>
        )}
        {msg && <div className={msg.includes("شد") || msg.includes("ساخته") ? "notice" : "error"}>{msg}</div>}
        <div className="formGrid">
          <div className="field"><label>عنوان</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="field"><label>Slug</label><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></div>
          <ContentPathFields entry={f} contentType={contentType} onChange={(patch) => setF({ ...f, ...patch })} />
          <div className="field full"><label>خلاصه</label><textarea style={{ fontFamily: "inherit", direction: "rtl", textAlign: "right" }} value={f.excerpt} onChange={(e) => setF({ ...f, excerpt: e.target.value })} /></div>
          <div className="field"><label>وضعیت Workflow</label><input value={f.status} readOnly className="readonlyField" /></div>
          <ParentEntryField siteId={f.site} entryId={id} value={f.parent || null} onChange={(parent) => setF({ ...f, parent })} />
          <label className="featuredField"><input type="checkbox" checked={Boolean(f.is_featured)} onChange={(e) => setF({ ...f, is_featured: e.target.checked })} /><span><strong>محتوای ویژه</strong><small>برای Featured sections و اولویت نمایش.</small></span></label>

          <TaxonomyFields siteId={f.site} categories={f.categories || []} tags={f.tags || []} onCategoriesChange={(categories) => setF({ ...f, categories })} onTagsChange={(tags) => setF({ ...f, tags })} />
          <CustomFieldsEditor schema={contentType?.schema} value={f.custom_fields || {}} siteId={f.site} onChange={(custom_fields) => setF({ ...f, custom_fields })} />

          <div className="field full contentEditorField"><label>محتوا</label><ProfessionalEditor siteId={f.site} value={f.blocks || []} onChange={(blocks) => setF({ ...f, blocks })} /></div>
        </div>
        <div className="actions"><button className="btn">ذخیره تغییرات</button></div>
      </form>

      <EditorialWorkflowPanel entryId={id} beforeAction={async () => { cancelAutosaveTimer(); await saveEntry(false); }} onUpdated={(entry) => { const normalized = normalizeEntry(entry); lastSavedFingerprint.current = fingerprint(normalized); setF(normalized); }} />
      <SeoPanel entryId={id} pageTitle={f.title} pagePath={f.path} />
      <SchemaBuilder entryId={id} pageTitle={f.title} pagePath={f.path} blocks={f.blocks || []} />
      <InternalLinksPanel entryId={id} />
      <RevisionPanel entryId={id} current={f} onRestored={(entry) => setF(normalizeEntry(entry))} />
    </>
  );
}
