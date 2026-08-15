"use client";

import { useEffect, useMemo, useState } from "react";
import MediaPicker, { MediaAsset } from "@/components/MediaPicker";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Site = {
  id: string;
  name: string;
  domain: string;
  default_language: string;
  timezone: string;
  organization_name?: string;
};

type SeoDefaults = {
  site_name: string;
  title_template: string;
  default_description: string;
  default_og_image: string;
  twitter_card: "summary" | "summary_large_image";
  robots_index: boolean;
  robots_follow: boolean;
};

type OrganizationSchema = {
  enabled: boolean;
  type: string;
  name: string;
  legal_name: string;
  url: string;
  logo: string;
  same_as: string[];
  email: string;
  telephone: string;
};

type CmsSettings = {
  frontend_url: string;
  audit_base_url: string;
  seo_defaults: SeoDefaults;
  organization_schema: OrganizationSchema;
};

type SettingsResponse = { site: string; settings: Record<string, unknown> };
type Tab = "general" | "seo" | "schema";

function defaults(site?: Site): CmsSettings {
  return {
    frontend_url: "",
    audit_base_url: "",
    seo_defaults: {
      site_name: site?.name || "",
      title_template: "{{title}}",
      default_description: "",
      default_og_image: "",
      twitter_card: "summary_large_image",
      robots_index: true,
      robots_follow: true,
    },
    organization_schema: {
      enabled: false,
      type: "Organization",
      name: site?.name || "",
      legal_name: "",
      url: "",
      logo: "",
      same_as: [],
      email: "",
      telephone: "",
    },
  };
}

function normalizeSettings(raw: Record<string, unknown>, site?: Site): CmsSettings {
  const initial = defaults(site);
  const seo = (raw.seo_defaults && typeof raw.seo_defaults === "object" ? raw.seo_defaults : {}) as Partial<SeoDefaults>;
  const schema = (raw.organization_schema && typeof raw.organization_schema === "object" ? raw.organization_schema : {}) as Partial<OrganizationSchema>;
  return {
    frontend_url: typeof raw.frontend_url === "string" ? raw.frontend_url : "",
    audit_base_url: typeof raw.audit_base_url === "string" ? raw.audit_base_url : "",
    seo_defaults: { ...initial.seo_defaults, ...seo },
    organization_schema: {
      ...initial.organization_schema,
      ...schema,
      same_as: Array.isArray(schema.same_as) ? schema.same_as.map(String) : [],
    },
  };
}

export default function SiteSettingsPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [settings, setSettings] = useState<CmsSettings>(() => defaults());
  const [tab, setTab] = useState<Tab>("general");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<"og" | "logo" | null>(null);

  const site = useMemo(() => sites.find((item) => item.id === siteId), [sites, siteId]);

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/").then((data) => {
      setSites(data.results);
      if (data.results[0]) setSiteId(data.results[0].id);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری سایت‌ها"));
  }, []);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    setMessage("");
    apiFetch<SettingsResponse>(`/sites/${siteId}/cms-settings/`)
      .then((data) => {
        if (!cancelled) setSettings(normalizeSettings(data.settings, sites.find((item) => item.id === siteId)));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "خطا در بارگذاری تنظیمات");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId, sites]);

  function patchSeo<K extends keyof SeoDefaults>(key: K, value: SeoDefaults[K]) {
    setSettings((current) => ({ ...current, seo_defaults: { ...current.seo_defaults, [key]: value } }));
  }

  function patchSchema<K extends keyof OrganizationSchema>(key: K, value: OrganizationSchema[K]) {
    setSettings((current) => ({ ...current, organization_schema: { ...current.organization_schema, [key]: value } }));
  }

  async function save() {
    if (!siteId) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await apiFetch<SettingsResponse>(`/sites/${siteId}/cms-settings/`, {
        method: "PATCH",
        body: JSON.stringify({ settings }),
      });
      setSettings(normalizeSettings(response.settings, site));
      setMessage("تنظیمات سایت ذخیره شد");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره تنظیمات");
    } finally {
      setSaving(false);
    }
  }

  function selectMedia(asset: MediaAsset) {
    if (!asset.url || !mediaTarget) return;
    if (mediaTarget === "og") patchSeo("default_og_image", asset.url);
    else patchSchema("logo", asset.url);
  }

  return (
    <>
      <PageHeader
        title="Site Settings"
        description="تنظیمات عمومی Headless Frontend، پیش‌فرض‌های SEO و Schema سراسری"
        action={<button type="button" className="btn" disabled={saving || loading || !siteId} onClick={save}>{saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}</button>}
      />

      {message && <div className={message.includes("ذخیره شد") ? "notice" : "error"}>{message}</div>}

      <div className="siteSettingsLayout">
        <aside className="panel siteSettingsSidebar">
          <div className="field">
            <label>سایت</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}
            </select>
          </div>
          {site && (
            <div className="siteIdentityCard">
              <strong>{site.name}</strong>
              <code dir="ltr">{site.domain}</code>
              <span>{site.organization_name || "Organization"}</span>
              <small>{site.default_language} · {site.timezone}</small>
            </div>
          )}
          <nav className="siteSettingsNav">
            <button type="button" className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}><b>⌁</b><span><strong>General</strong><small>Frontend & crawler</small></span></button>
            <button type="button" className={tab === "seo" ? "active" : ""} onClick={() => setTab("seo")}><b>◎</b><span><strong>SEO Defaults</strong><small>Metadata fallbacks</small></span></button>
            <button type="button" className={tab === "schema" ? "active" : ""} onClick={() => setTab("schema")}><b>{"{}"}</b><span><strong>Organization Schema</strong><small>Global JSON-LD</small></span></button>
          </nav>
          <div className="siteSettingsSecurityNote">فقط تنظیمات SEO-safe در API عمومی expose می‌شوند؛ کل <code>Site.settings</code> خصوصی باقی می‌ماند.</div>
        </aside>

        <main className="panel siteSettingsEditor">
          {loading ? <div className="emptyState">در حال بارگذاری تنظیمات...</div> : tab === "general" ? (
            <GeneralSettings settings={settings} onChange={setSettings} site={site} />
          ) : tab === "seo" ? (
            <SeoSettings value={settings.seo_defaults} onChange={patchSeo} onMedia={() => setMediaTarget("og")} site={site} />
          ) : (
            <SchemaSettings value={settings.organization_schema} onChange={patchSchema} onMedia={() => setMediaTarget("logo")} site={site} />
          )}

          <div className="siteSettingsSaveBar">
            <button type="button" className="btn" disabled={saving || loading || !siteId} onClick={save}>{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</button>
            <span>تغییرات Metadata در درخواست‌های بعدی SDK اعمال می‌شوند.</span>
          </div>
        </main>
      </div>

      <MediaPicker
        siteId={siteId}
        open={Boolean(mediaTarget)}
        imageOnly
        selectedUrl={mediaTarget === "og" ? settings.seo_defaults.default_og_image : settings.organization_schema.logo}
        onClose={() => setMediaTarget(null)}
        onSelect={selectMedia}
      />
    </>
  );
}

function GeneralSettings({ settings, onChange, site }: { settings: CmsSettings; onChange: (value: CmsSettings) => void; site?: Site }) {
  return <div className="siteSettingsSection">
    <div className="siteSettingsSectionHeader"><div><h2>General</h2><p>آدرس Frontend برای Preview و آدرس پایه Crawler را مشخص کنید.</p></div></div>
    <div className="settingsInfoGrid">
      <div><span>Domain</span><strong dir="ltr">{site?.domain || "—"}</strong></div>
      <div><span>Language</span><strong>{site?.default_language || "—"}</strong></div>
      <div><span>Timezone</span><strong>{site?.timezone || "—"}</strong></div>
    </div>
    <div className="settingsFormGrid">
      <div className="field full"><label>Frontend URL</label><input dir="ltr" value={settings.frontend_url} onChange={(e) => onChange({ ...settings, frontend_url: e.target.value })} placeholder="https://www.example.com" /><small>برای Signed Draft Preview استفاده می‌شود. اگر خالی باشد domain سایت استفاده می‌شود.</small></div>
      <div className="field full"><label>Audit Base URL</label><input dir="ltr" value={settings.audit_base_url} onChange={(e) => onChange({ ...settings, audit_base_url: e.target.value })} placeholder="https://www.example.com" /><small>آدرس شروع SEO Crawler. اگر خالی باشد Frontend URL و سپس domain استفاده می‌شود.</small></div>
    </div>
  </div>;
}

function SeoSettings({ value, onChange, onMedia, site }: { value: SeoDefaults; onChange: <K extends keyof SeoDefaults>(key: K, value: SeoDefaults[K]) => void; onMedia: () => void; site?: Site }) {
  const previewTitle = value.title_template.replaceAll("{{title}}", "عنوان نمونه صفحه").replaceAll("{{site_name}}", value.site_name || site?.name || "Site");
  return <div className="siteSettingsSection">
    <div className="siteSettingsSectionHeader"><div><h2>SEO Defaults</h2><p>وقتی یک صفحه Meta اختصاصی ندارد، SDK از این مقادیر استفاده می‌کند.</p></div></div>
    <div className="settingsFormGrid">
      <div className="field"><label>Site / Brand Name</label><input value={value.site_name} onChange={(e) => onChange("site_name", e.target.value)} placeholder={site?.name} /></div>
      <div className="field"><label>Twitter Card</label><select value={value.twitter_card} onChange={(e) => onChange("twitter_card", e.target.value as SeoDefaults["twitter_card"])}><option value="summary_large_image">summary_large_image</option><option value="summary">summary</option></select></div>
      <div className="field full"><label>Title Template</label><input dir="ltr" value={value.title_template} onChange={(e) => onChange("title_template", e.target.value)} placeholder="{{title}} | {{site_name}}" /><small>الزاماً شامل <code>{"{{title}}"}</code> باشد. متغیر دوم: <code>{"{{site_name}}"}</code></small></div>
      <div className="settingsTitlePreview full"><span>Preview</span><strong>{previewTitle}</strong></div>
      <div className="field full"><label>Default Description</label><textarea value={value.default_description} onChange={(e) => onChange("default_description", e.target.value)} placeholder="توضیح پیش‌فرض سایت..." /><small>{value.default_description.length}/320</small></div>
      <div className="field full"><label>Default OG Image</label><div className="settingsMediaRow"><input dir="ltr" value={value.default_og_image} onChange={(e) => onChange("default_og_image", e.target.value)} placeholder="https://..." /><button type="button" className="btn secondary small" onClick={onMedia}>انتخاب از رسانه</button></div>{value.default_og_image && <div className="settingsImagePreview"><img src={value.default_og_image} alt="Default OG" /></div>}</div>
      <label className="settingsToggle"><input type="checkbox" checked={value.robots_index} onChange={(e) => onChange("robots_index", e.target.checked)} /><span><strong>Index by default</strong><small>برای صفحاتی که SeoMeta ندارند.</small></span></label>
      <label className="settingsToggle"><input type="checkbox" checked={value.robots_follow} onChange={(e) => onChange("robots_follow", e.target.checked)} /><span><strong>Follow by default</strong><small>پیش‌فرض لینک‌های صفحات بدون Meta اختصاصی.</small></span></label>
    </div>
  </div>;
}

function SchemaSettings({ value, onChange, onMedia, site }: { value: OrganizationSchema; onChange: <K extends keyof OrganizationSchema>(key: K, value: OrganizationSchema[K]) => void; onMedia: () => void; site?: Site }) {
  const [sameAsText, setSameAsText] = useState(() => value.same_as.join("\n"));
  useEffect(() => setSameAsText(value.same_as.join("\n")), [value.same_as]);
  const preview = {
    "@context": "https://schema.org",
    "@type": value.type || "Organization",
    name: value.name || site?.name || "Organization",
    ...(value.legal_name ? { legalName: value.legal_name } : {}),
    ...(value.url ? { url: value.url } : {}),
    ...(value.logo ? { logo: value.logo } : {}),
    ...(value.same_as.length ? { sameAs: value.same_as } : {}),
    ...(value.email ? { email: value.email } : {}),
    ...(value.telephone ? { telephone: value.telephone } : {}),
  };
  return <div className="siteSettingsSection">
    <div className="siteSettingsSectionHeader"><div><h2>Organization Schema</h2><p>JSON-LD سراسری که SDK می‌تواند در تمام صفحات رندر کند.</p></div><label className="schemaEnable"><input type="checkbox" checked={value.enabled} onChange={(e) => onChange("enabled", e.target.checked)} /> فعال</label></div>
    <div className={`settingsFormGrid ${!value.enabled ? "settingsDisabled" : ""}`}>
      <div className="field"><label>Schema.org Type</label><input dir="ltr" value={value.type} onChange={(e) => onChange("type", e.target.value)} placeholder="Organization" /></div>
      <div className="field"><label>Name</label><input value={value.name} onChange={(e) => onChange("name", e.target.value)} placeholder={site?.name} /></div>
      <div className="field"><label>Legal Name</label><input value={value.legal_name} onChange={(e) => onChange("legal_name", e.target.value)} /></div>
      <div className="field"><label>Website URL</label><input dir="ltr" value={value.url} onChange={(e) => onChange("url", e.target.value)} placeholder="https://..." /></div>
      <div className="field full"><label>Logo</label><div className="settingsMediaRow"><input dir="ltr" value={value.logo} onChange={(e) => onChange("logo", e.target.value)} placeholder="https://..." /><button type="button" className="btn secondary small" onClick={onMedia}>انتخاب Logo</button></div>{value.logo && <div className="settingsImagePreview logo"><img src={value.logo} alt="Organization logo" /></div>}</div>
      <div className="field"><label>Email</label><input dir="ltr" type="email" value={value.email} onChange={(e) => onChange("email", e.target.value)} /></div>
      <div className="field"><label>Telephone</label><input dir="ltr" value={value.telephone} onChange={(e) => onChange("telephone", e.target.value)} /></div>
      <div className="field full"><label>SameAs URLs</label><textarea dir="ltr" value={sameAsText} onChange={(e) => { const text=e.target.value; setSameAsText(text); onChange("same_as", text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)); }} placeholder={"https://instagram.com/...\nhttps://linkedin.com/company/..."} /><small>هر URL در یک خط.</small></div>
      <div className="organizationSchemaPreview full"><div><strong>JSON-LD Preview</strong><span>{value.enabled ? "در خروجی عمومی قابل استفاده" : "غیرفعال"}</span></div><pre dir="ltr">{JSON.stringify(preview, null, 2)}</pre></div>
    </div>
  </div>;
}
