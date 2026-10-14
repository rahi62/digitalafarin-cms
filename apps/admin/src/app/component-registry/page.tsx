"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { adminPath } from "@/lib/admin-path";
import { apiFetch, getAccessToken, Paginated } from "@/lib/api";
import {
  ComponentSlotDraft, RouteReportItem, SiteContentType,
  customFieldSources, defaultPropSources, eligibleRoute,
  generateRegistryCode, normalizeRegistryRoute, validateComponentSlots,
} from "@/lib/component-wizard";

type Report = {
  version: number;
  generated_at: string;
  routes: RouteReportItem[];
  mappings: Array<{ route: string; source: "cms" | "host"; content_type: string | null }>;
  errors: string[];
  warnings: string[];
};
type Site = { id: string; name: string; domain: string };
type SavedBindingSlot = {
  id: string; component: string; route: string;
  props: Record<string, string>; required?: string[];
};
type SavedDraft = {
  id: string; site: string; host_key: string; version: number;
  slots: SavedBindingSlot[]; updated_at: string;
};
type SavedHistory = { current_version: number; results: Array<{ version: number; created_at: string; created_by: string | null }> };
type Approval = {
  draft_version: number; approved_version: number | null; approved_checksum: string | null;
  approved_at: string | null; runtime_status: "unverified"; has_unapproved_changes: boolean;
  events: Array<{ id: string; action: string; from_version: number | null; to_version: number | null; reason: string; created_at: string }>;
};

function toSavedSlots(drafts: ComponentSlotDraft[]): SavedBindingSlot[] {
  return drafts.map((slot) => ({
    id: slot.id, component: slot.component, route: normalizeRegistryRoute(slot.route) || slot.route,
    props: Object.fromEntries(slot.props.map((prop) => [prop.name, prop.source])),
    required: slot.props.filter((prop) => prop.required).map((prop) => prop.name),
  }));
}
function fromSavedSlots(saved: SavedBindingSlot[]): ComponentSlotDraft[] {
  return saved.map((slot) => ({
    id: slot.id, component: slot.component, route: slot.route,
    props: Object.entries(slot.props).map(([name, source]) => ({
      name, source, required: Boolean(slot.required?.includes(name)),
    })),
  }));
}

function newSlot(route: string): ComponentSlotDraft {
  return {
    id: "HomeHero", component: "HeroSection", route,
    props: [{ name: "heading", source: "content.title", required: true }],
  };
}

export default function ComponentRegistryPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [types, setTypes] = useState<SiteContentType[]>([]);
  const [contentType, setContentType] = useState("");
  const [slots, setSlots] = useState<ComponentSlotDraft[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typesLoading, setTypesLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [stored, setStored] = useState<SavedDraft[]>([]);
  const [draftId, setDraftId] = useState("");
  const [hostKey, setHostKey] = useState("main");
  const [version, setVersion] = useState<number | null>(null);
  const [history, setHistory] = useState<SavedHistory | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [approval, setApproval] = useState<Approval | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [rollbackVersion, setRollbackVersion] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      const token = getAccessToken();
      if (!token) { setError("ابتدا به پنل CMS وارد شوید."); setLoading(false); return; }
      setLoading(true);
      try {
        const [response, siteResponse] = await Promise.all([
          fetch(adminPath("/route-explorer/report"), {
            headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: abort.signal,
          }),
          apiFetch<Paginated<Site>>("/sites/?page_size=100", { signal: abort.signal }),
        ]);
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail || "گزارش مسیرهای میزبان در دسترس نیست");
        if (body.version !== 1 || !Array.isArray(body.routes)) throw new Error("گزارش مسیر معتبر نیست");
        if (abort.signal.aborted) return;
        const nextReport = body as Report;
        setReport(nextReport);
        setSites(siteResponse.results);
        if (siteResponse.results[0]) setSiteId(siteResponse.results[0].id);
        const urlRoute = new URLSearchParams(window.location.search).get("route");
        const route = nextReport.routes.find((row) =>
          eligibleRoute(row) && (row.url === urlRoute || normalizeRegistryRoute(row.url) === normalizeRegistryRoute(urlRoute || "")));
        const first = route || nextReport.routes.find(eligibleRoute);
        setSlots(first ? [newSlot(normalizeRegistryRoute(first.url) || first.url)] : []);
        setSelected(0);
      } catch (cause) {
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "دریافت گزارش ناموفق بود");
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!siteId) { setTypes([]); setContentType(""); return; }
    const abort = new AbortController();
    setTypesLoading(true);
    apiFetch<Paginated<SiteContentType>>(`/content/types/?site=${encodeURIComponent(siteId)}&page_size=100`,
      { signal: abort.signal })
      .then(({ results }) => {
        if (abort.signal.aborted) return;
        setTypes(results);
        setContentType(results[0]?.id || "");
      })
      .catch((cause) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "ساختارهای محتوا بارگذاری نشدند"); })
      .finally(() => { if (!abort.signal.aborted) setTypesLoading(false); });
    return () => abort.abort();
  }, [siteId]);

  useEffect(() => {
    if (!siteId) { setStored([]); return; }
    const controller = new AbortController();
    apiFetch<Paginated<SavedDraft>>(`/content/component-bindings/?site=${encodeURIComponent(siteId)}&page_size=100`,
      { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setStored(result.results); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "بارگذاری پیش‌نویس اتصال‌ها ناموفق بود"); });
    return () => controller.abort();
  }, [siteId]);

  const available = useMemo(() => (report?.routes || []).filter(eligibleRoute), [report]);
  const active = slots[selected] || null;
  const selectedType = types.find((item) => item.id === contentType);
  const choices = useMemo(() => [
    ...defaultPropSources,
    ...customFieldSources(selectedType?.schema?.fields).map((item) => ({
      ...item, label: `فیلد ${item.label}`,
    })),
  ], [selectedType]);
  const issues = useMemo(() => validateComponentSlots(slots, report?.routes || []), [slots, report]);
  const generated = useMemo(() => issues.length === 0 && slots.length > 0 ? generateRegistryCode(slots) : "", [slots, issues]);
  const mapped = report?.mappings.find((item) => active && normalizeRegistryRoute(item.route) === normalizeRegistryRoute(active.route));
  const rollbackVersions = Array.from(new Set((approval?.events || []).map((event) => event.to_version)))
    .filter((entryVersion): entryVersion is number => entryVersion !== null && entryVersion !== approval?.approved_version)
    .sort((a, b) => b - a);

  async function loadApproval(id: string) {
    try {
      const status = await apiFetch<Approval>(`/content/component-bindings/${id}/approval/`);
      setApproval(status);
    } catch (cause) {
      setApproval(null);
      setError(cause instanceof Error ? cause.message : "وضعیت تأیید Registry بارگذاری نشد.");
    }
  }
  async function changeApproval(action: "approve" | "rollback" | "revoke") {
    if (!draftId || version === null || approvalBusy || unsavedChanges || !approval) return;
    const destination = action === "revoke" ? null : action === "approve" ? version : Number(rollbackVersion);
    if (action !== "revoke" && (!Number.isInteger(destination) || destination === null || destination < 1)) return;
    if ((action === "rollback" || action === "revoke") && !rollbackReason.trim()) {
      setError("برای بازگردانی، دلیل تغییر را وارد کنید."); return;
    }
    const message = action === "approve"
      ? `نسخه ${destination} برای استقرار احتمالی تأیید شود؟ این عملیات کد Next.js یا سایت زنده را تغییر نمی‌دهد.`
      : action === "revoke" ? "تأیید فعلی کاملاً لغو شود؟ تاریخچه محفوظ است و این عمل هیچ دیپلوی خودکاری ایجاد نمی‌کند."
      : `تأیید نسخه ${approval.approved_version} به نسخه ${destination} برگردد؟ هیچ دیپلوی خودکاری انجام نمی‌شود.`;
    if (!window.confirm(message)) return;
    setApprovalBusy(true); setError(""); setNotice("");
    try {
      const updated = await apiFetch<Approval>(
        `/content/component-bindings/${draftId}/${action === "approve" ? "approve" : action === "revoke" ? "revoke-approval" : "rollback-approval"}/`,
        { method: "POST", body: JSON.stringify({
          confirm: true, target_version: destination,
          expected_draft_version: version,
          expected_approved_version: approval.approved_version,
          reason: action === "approve" ? "" : rollbackReason.trim(),
        }) },
      );
      setApproval(updated); setRollbackVersion(""); setRollbackReason("");
      setNotice(`وضعیت تأیید ${destination === null ? "لغو شد" : `نسخه ${destination.toLocaleString("fa-IR")} ثبت شد`}؛ وضعیت اجرای میزبان همچنان تأیید نشده است.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تغییر تأیید ناموفق بود. نسخه‌ها را دوباره بررسی کنید.");
      await loadApproval(draftId);
    } finally { setApprovalBusy(false); }
  }
  async function copyApprovedManifest() {
    if (!draftId || !approval?.approved_version) return;
    try {
      const manifest = await apiFetch<Record<string, unknown>>(`/content/component-bindings/${draftId}/approved-manifest/`);
      await navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
      setNotice("نسخه تأییدشده برای بررسی و استفاده در میزبان کپی شد؛ هیچ تغییری روی سرور اعمال نشد.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "دریافت نسخه تأییدشده ناموفق بود"); }
  }

  function clearSavedSelection() {
    setDraftId(""); setVersion(null); setHistory(null); setHostKey("main");
    setApproval(null); setUnsavedChanges(false); setRollbackVersion(""); setRollbackReason("");
    setNotice("");
  }
  async function openSaved(draft: SavedDraft) {
    setDraftId(draft.id); setHostKey(draft.host_key); setVersion(draft.version);
    setSlots(fromSavedSlots(draft.slots)); setSelected(0);
    setCopied(false); setNotice(""); setUnsavedChanges(false);
    setApproval(null); setRollbackVersion(""); setRollbackReason("");
    await loadApproval(draft.id);
    try {
      const result = await apiFetch<SavedHistory>(`/content/component-bindings/${draft.id}/history/`);
      setHistory(result);
    } catch { setHistory(null); }
  }
  async function saveDraft() {
    if (!siteId || issues.length || slots.length === 0 || saving) return;
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(hostKey)) {
      setError("شناسه میزبان باید کوچک و شامل حروف لاتین، اعداد، خط‌تیره یا زیرخط باشد."); return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const values = { site: siteId, host_key: hostKey, slots: toSavedSlots(slots) };
      const payload = draftId ? { ...values, expected_version: version } : values;
      const result = await apiFetch<SavedDraft>(
        draftId ? `/content/component-bindings/${draftId}/` : "/content/component-bindings/",
        { method: draftId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setDraftId(result.id); setVersion(result.version);
      setUnsavedChanges(false);
      void loadApproval(result.id);
      setNotice(`پیش‌نویس اتصال‌ها، نسخه ${result.version.toLocaleString("fa-IR")} ذخیره شد. این کار سایت میزبان را تغییر نمی‌دهد.`);
      const fresh = await apiFetch<Paginated<SavedDraft>>(`/content/component-bindings/?site=${encodeURIComponent(siteId)}&page_size=100`);
      setStored(fresh.results);
      const record = await apiFetch<SavedHistory>(`/content/component-bindings/${result.id}/history/`);
      setHistory(record);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ذخیره پیش‌نویس موفق نبود؛ ممکن است مدیر دیگری نسخه را تغییر داده باشد.");
    } finally { setSaving(false); }
  }

  function updateActive(patch: Partial<ComponentSlotDraft>) {
    setSlots((prev) => prev.map((item, index) => index === selected ? { ...item, ...patch } : item));
    setCopied(false); setUnsavedChanges(true);
  }
  function changeProp(index: number, patch: Partial<ComponentSlotDraft["props"][number]>) {
    if (!active) return;
    updateActive({ props: active.props.map((item, position) => position === index ? { ...item, ...patch } : item) });
  }
  function addSlot() {
    const base = available.find((route) => !slots.some((item) => normalizeRegistryRoute(item.route) === normalizeRegistryRoute(route.url))) || available[0];
    if (!base) return;
    setSlots((prev) => [...prev, { ...newSlot(normalizeRegistryRoute(base.url) || base.url), id: `Slot${prev.length + 1}` }]);
    setSelected(slots.length);
    setCopied(false); setUnsavedChanges(true);
  }
  function removeSlot() {
    setSlots((prev) => prev.filter((_, i) => i !== selected));
    setSelected(Math.max(0, selected - 1));
    setCopied(false); setUnsavedChanges(true);
  }
  async function copyCode() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setError("");
    } catch {
      setError("کپی خودکار در دسترس نیست؛ کد تولیدشده را به‌صورت دستی انتخاب کنید.");
    }
  }
  return <>
    <PageHeader title="اتصال بصری کامپوننت‌ها" description="اتصال فیلدهای محتوای CMS به کامپوننت‌های موجود Next.js بدون تغییر خودکار فایل‌های میزبان"
      action={<Link className="btn secondary" href={adminPath("/route-explorer")}>بازگشت به کاوشگر مسیرها</Link>} />
    <div className="registryNotice" role="note">
      این ابزار فقط کد پیکربندی قابل‌بازبینی تولید می‌کند؛ اتصالات تا زمانی که توسعه‌دهنده کد را در پروژه میزبان اعمال نکرده، فعال نیستند. گزارش مسیرها نیز یک Snapshot است و اتصال واقعی API را تأیید نمی‌کند.
    </div>
    {loading && <div className="panel" role="status">در حال دریافت مسیرهای میزبان و سایت‌ها...</div>}
    {error && <div className="error" role="alert">{error}</div>}
    {!loading && !report && <div className="panel registryEmpty">
      <h2>گزارش مسیرهای Next.js در دسترس نیست</h2>
      <p>در پروژه میزبان، گزارش مسیرها را با CLI تولید و مسیر خروجی آن را برای سرور پنل تنظیم کنید.</p>
      <code dir="ltr">npx @digitalafarin/cms-cli routes --frontend . --export-report</code>
    </div>}
    {report && <>
      <section className="panel registryDrafts" aria-label="پیش‌نویس‌های نسخه‌دار">
        <div className="registryDraftsHeader"><div><h2>پیش‌نویس‌های اتصال</h2>
          <p>نسخه‌ها در CMS ذخیره می‌شوند، اما فقط کد تأییدشده و اعمال‌شده در پروژه Next.js اجرا می‌شود.</p></div>
          <button type="button" className="btn secondary small" onClick={() => {
            clearSavedSelection();
            const first = available[0];
            setSlots(first ? [newSlot(normalizeRegistryRoute(first.url) || first.url)] : []);
            setSelected(0);
          }}>پیکربندی جدید</button></div>
        <div className="registryDraftsControls">
          <label className="field"><span>نسخه ذخیره‌شده</span>
            <select value={draftId} onChange={(event) => {
              const selectedDraft = stored.find((item) => item.id === event.target.value);
              if (selectedDraft) void openSaved(selectedDraft);
              else clearSavedSelection();
            }}>
              <option value="">پیکربندی جدید و ذخیره‌نشده</option>
              {stored.map((draft) => <option key={draft.id} value={draft.id}>
                {draft.host_key} — نسخه {draft.version.toLocaleString("fa-IR")}
              </option>)}
            </select>
          </label>
          <label className="field"><span>شناسه پروژه میزبان</span>
            <input dir="ltr" value={hostKey} disabled={Boolean(draftId)} placeholder="main"
              onChange={(event) => setHostKey(event.target.value)} />
          </label>
          <button type="button" className="btn" disabled={!generated || !siteId || saving}
            onClick={() => void saveDraft()}>{saving ? "در حال ذخیره..." : draftId ? "ذخیره نسخه جدید" : "ثبت پیش‌نویس"}</button>
        </div>
        {notice && <p className="registryDraftNotice" role="status">{notice}</p>}
        {history && <div className="registryHistory">
          <strong>تاریخچه: {history.results.length.toLocaleString("fa-IR")} نسخه اخیر</strong>
          <span>{history.results.map((item) => item.version.toLocaleString("fa-IR")).join(" ← ")}</span>
        </div>}
      </section>
      {draftId && <section className="panel registryApproval" aria-label="تأیید نسخه و بازگردانی">
        <div className="registryApprovalHead"><h2>تأیید کنترل‌شده نسخه Registry</h2>
          <span>اجرا روی میزبان: <strong>تأییدنشده</strong></span>
        </div>
        <p>تأیید یا Rollback فقط نسخه منتخب در CMS را تغییر می‌دهد. استقرار و اتصال واقعی Next.js باید جداگانه بررسی و اعمال شود.</p>
        {approval ? <>
          <div className="registryApprovalStats">
            <span>نسخه پیش‌نویس: <strong>{version?.toLocaleString("fa-IR")}</strong></span>
            <span>آخرین نسخه تأییدشده: <strong>{approval.approved_version?.toLocaleString("fa-IR") || "ندارد"}</strong></span>
            {unsavedChanges && <strong className="registryApprovalWarning">تغییرات ذخیره‌نشده دارید؛ ابتدا ذخیره کنید.</strong>}
          </div>
          <div className="registryApprovalActions">
            <button className="btn" type="button" disabled={approvalBusy || unsavedChanges || !generated || approval.approved_version === version}
              onClick={() => void changeApproval("approve")}>{approvalBusy ? "در حال ثبت..." : "تأیید نسخه ذخیره‌شده"}</button>
            <button className="btn secondary" type="button" disabled={approvalBusy || !approval.approved_version}
              onClick={() => void copyApprovedManifest()}>کپی Manifest تأییدشده</button>
          </div>
          {approval.approved_version !== null && <div className="registryRevoke">
            <strong>لغو کامل تأیید</strong>
            <p>برای بازگشت به وضعیت بدون نسخه تأییدشده (حتی اولین تأیید)، دلیل را در فیلد پایین وارد کنید. هیچ رکوردی حذف نمی‌شود.</p>
            <button type="button" className="btn secondary"
              disabled={approvalBusy || unsavedChanges || !rollbackReason.trim()}
              onClick={() => void changeApproval("revoke")}>لغو تأیید فعلی</button>
          </div>}
          {rollbackVersions.length > 0 && <div className="registryRollback">
            <h3>بازگرداندن تأیید به نسخه قبلی</h3>
            <div className="registryRollbackFields">
              <label className="field"><span>نسخه قبلاً تأییدشده</span>
                <select value={rollbackVersion} onChange={(event) => setRollbackVersion(event.target.value)}>
                  <option value="">انتخاب نسخه</option>
                  {rollbackVersions.map((item) => <option key={item} value={item}>{item.toLocaleString("fa-IR")}</option>)}
                </select></label>
              <label className="field"><span>دلیل بازگردانی</span>
                <input value={rollbackReason} maxLength={500} onChange={(event) => setRollbackReason(event.target.value)} />
              </label>
              <button type="button" className="btn secondary"
                disabled={approvalBusy || unsavedChanges || !rollbackVersion || !rollbackReason.trim()}
                onClick={() => void changeApproval("rollback")}>ثبت Rollback تأیید</button>
            </div>
          </div>}
          {approval.events.length > 0 && <div className="registryApprovalLog">
            <strong>تاریخچه تأییدها</strong>
            {approval.events.slice(0, 8).map((event) => <div key={event.id}>
              <span>{event.action === "revoke" ? "لغو تأیید" : `${event.action === "rollback" ? "بازگردانی" : "تأیید"} نسخه ${event.to_version?.toLocaleString("fa-IR") || "نامشخص"}`}</span>
              <small>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</small>
              {event.reason && <small>{event.reason}</small>}
            </div>)}
          </div>}
        </> : <p>وضعیت تأیید هنوز دریافت نشده است.</p>}
      </section>}
      <div className="registryContext panel">
        <label className="field"><span>سایت محتوایی</span>
          <select value={siteId} onChange={(event) => { setSiteId(event.target.value); clearSavedSelection(); }}>
            {sites.map((site) => <option key={site.id} value={site.id}>{site.name} — {site.domain}</option>)}
          </select>
        </label>
        <label className="field"><span>ساختار محتوا برای انتخاب فیلد</span>
          <select value={contentType} disabled={typesLoading} onChange={(event) => setContentType(event.target.value)}>
            <option value="">انتخاب ساختار</option>
            {types.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.slug})</option>)}
          </select>
        </label>
        <span className="registryContextNote">{available.length.toLocaleString("fa-IR")} مسیر استاتیک مجاز؛ {report.errors.length.toLocaleString("fa-IR")} خطای گزارش</span>
      </div>
      {available.length === 0 && <div className="panel registryEmpty">
        <p>در گزارش فعلی مسیر استاتیک قابل‌اتصال پیدا نشد. مسیرهای پویا یا زیرساختی در این نسخه عمداً مجاز نیستند.</p>
      </div>}
      {available.length > 0 && <div className="registryLayout">
        <aside className="panel registrySlots">
          <div className="registrySlotsHeader"><strong>اتصالات تعریف‌شده</strong>
            <button type="button" className="btn secondary small" onClick={addSlot} disabled={slots.length >= 100}>+ افزودن</button>
          </div>
          {slots.map((slot, index) => <button type="button" key={index}
            className={selected === index ? "registrySlot isActive" : "registrySlot"}
            onClick={() => setSelected(index)}>
            <strong>{slot.id || "بدون شناسه"}</strong><code dir="ltr">{slot.route}</code>
            <small>{slot.component}</small>
          </button>)}
        </aside>
        <div className="panel registryEditor">
          {active && <>
            <div className="registryEditorHeader"><h2>تنظیم اتصال</h2>
              <button type="button" className="btn secondary small" onClick={removeSlot}>حذف اتصال</button>
            </div>
            <div className="registryEditorGrid">
              <label className="field"><span>شناسه اتصال</span><input dir="ltr" value={active.id}
                onChange={(event) => updateActive({ id: event.target.value })} placeholder="HomeHero" /></label>
              <label className="field"><span>نام کامپوننت در پروژه Next.js</span><input dir="ltr" value={active.component}
                onChange={(event) => updateActive({ component: event.target.value })} placeholder="HeroSection" /></label>
              <label className="field"><span>مسیر صفحه میزبان</span><select dir="ltr" value={active.route}
                onChange={(event) => updateActive({ route: event.target.value })}>
                {available.map((route) => <option key={route.file} value={normalizeRegistryRoute(route.url) || route.url}>{route.url}</option>)}
              </select></label>
            </div>
            <div className="registryRouteContext">
              <strong>مالک مسیر در گزارش:</strong> {mapped?.source === "cms" ? `CMS · ${mapped.content_type || ""}` : mapped?.source === "host" ? "پروژه میزبان" : "هنوز تعیین نشده"}
              <span>این تنظیم مالکیت مسیر را تغییر نمی‌دهد.</span>
            </div>
            <div className="registryPropsHeader"><h3>نگاشت فیلدها به Props</h3>
              <button type="button" className="btn secondary small" disabled={active.props.length >= 50}
                onClick={() => updateActive({ props: [...active.props, { name: `prop${active.props.length + 1}`, source: "content.title", required: false }] })}>
                + افزودن Props
              </button>
            </div>
            <div className="registryProps">
              {active.props.map((prop, index) => <div className="registryProp" key={index}>
                <label className="field"><span>نام Props</span><input dir="ltr" value={prop.name}
                  onChange={(event) => changeProp(index, { name: event.target.value })} /></label>
                <label className="field"><span>فیلد CMS</span><select dir="ltr" value={prop.source}
                  onChange={(event) => changeProp(index, { source: event.target.value })}>
                  {!choices.some((option) => option.value === prop.source) &&
                    <option value={prop.source}>{prop.source} (در ساختار فعلی یافت نشد)</option>}
                  {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label} — {choice.value}</option>)}
                </select></label>
                <label className="registryRequired"><input type="checkbox" checked={prop.required}
                  onChange={(event) => changeProp(index, { required: event.target.checked })} /> الزامی</label>
                <button type="button" className="btn secondary small" onClick={() =>
                  updateActive({ props: active.props.filter((_, pos) => pos !== index) })}>حذف</button>
              </div>)}
            </div>
          </>}
        </div>
      </div>}
      <section className="panel registryOutput">
        <h2>خروجی قابل‌استفاده در Next.js</h2>
        {issues.length > 0 && <div role="alert" className="registryErrors">
          <strong>پیش از تولید کد، خطاها را برطرف کنید:</strong>
          <ul>{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
        </div>}
        {generated ? <>
          <p>فایل پیشنهادی: <code dir="ltr">src/lib/cms-components.ts</code>. این کد بدون تغییر فایل‌های میزبان، آماده کپی و بازبینی است.</p>
          <pre dir="ltr" className="registryCode">{generated}</pre>
          <button type="button" className="btn" onClick={copyCode}>{copied ? "کد کپی شد" : "کپی پیکربندی TypeScript"}</button>
        </> : <p className="muted">پس از انتخاب حداقل یک اتصال معتبر، کد اینجا تولید می‌شود.</p>}
      </section>
    </>}
  </>;
}
