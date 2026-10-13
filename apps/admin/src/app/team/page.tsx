"use client";

import { FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Organization = { id: string; name: string };
type Membership = { id: string; organization: string; user: string; username: string; role: string };
const labels: Record<string, string> = {
  owner: "مالک", admin: "مدیر", seo: "مدیر سئو", editor: "ویراستار", writer: "نویسنده", viewer: "مشاهده‌کننده",
};
const roles = Object.entries(labels);

export default function TeamPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState("");
  const [members, setMembers] = useState<Paginated<Membership> | null>(null);
  const [page, setPage] = useState(1);
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState("writer");
  const [edit, setEdit] = useState<Membership | null>(null);
  const [editRole, setEditRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<Paginated<Organization>>("/organizations/?page_size=100").then((data) => {
      if (!active) return;
      setOrganizations(data.results);
      setOrganization((current) => current || data.results[0]?.id || "");
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "دریافت سازمان‌ها ناموفق بود"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!organization) { setLoading(false); setMembers(null); return; }
    let active = true;
    setLoading(true); setError("");
    const params = new URLSearchParams({ organization, page: String(page), page_size: "20" });
    apiFetch<Paginated<Membership>>(`/memberships/?${params}`).then((data) => {
      if (active) setMembers(data);
    }).catch((cause) => { if (active) { setMembers(null); setError(cause instanceof Error ? cause.message : "بارگذاری اعضا ناموفق بود"); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organization, page, refresh]);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (!identifier.trim() || !organization) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await apiFetch("/memberships/", { method: "POST", body: JSON.stringify({ organization, user_identifier: identifier.trim(), role }) });
      setIdentifier(""); setRole("writer");
      setSuccess("عضو موجود به سازمان اضافه شد.");
      setPage(1); setRefresh((n) => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "افزودن عضو ناموفق بود"); }
    finally { setBusy(false); }
  }
  async function saveRole() {
    if (!edit) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await apiFetch(`/memberships/${edit.id}/`, { method: "PATCH", body: JSON.stringify({ role: editRole }) });
      setEdit(null); setRefresh((n) => n + 1); setSuccess("نقش کاربر به‌روزرسانی شد.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تغییر نقش ناموفق بود"); }
    finally { setBusy(false); }
  }
  async function revoke(item: Membership) {
    if (!window.confirm(`دسترسی ${item.username} به این سازمان لغو شود؟ حساب کاربری Django حذف نخواهد شد.`)) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await apiFetch(`/memberships/${item.id}/`, { method: "DELETE" });
      setEdit(null); setRefresh((n) => n + 1); setSuccess("دسترسی کاربر به سازمان لغو شد؛ حساب اصلی محفوظ است.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "لغو دسترسی ناموفق بود"); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader title="کاربران و سطح دسترسی" description="مدیریت عضویت کاربران موجود Django در سازمان‌ها با نقش‌های مستقل" />
    <div className="cmsReusableNotice">افزودن عضو با نام کاربری حسابی انجام می‌شود که قبلاً در Django ساخته شده است. این صفحه حساب جدید نمی‌سازد و امکان لغو عضویت، حساب کاربری اصلی را حذف نمی‌کند.</div>
    {error && <div className="error" role="alert">{error}</div>}
    {success && <div className="notice" role="status">{success}</div>}
    <section className="panel">
      <div className="cmsTeamOrganization"><label className="field"><span>سازمان</span><select value={organization} onChange={(event) => { setOrganization(event.target.value); setPage(1); setEdit(null); }}>
        {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label><span>{members?.count.toLocaleString("fa-IR") || "۰"} عضو</span></div>
      {loading ? <div className="cmsSitesEmpty" role="status">در حال دریافت اعضا...</div> : members?.results.length ?
        <div className="tableWrap"><table className="table cmsTeamTable"><thead><tr><th>کاربر</th><th>نقش</th><th>مدیریت</th></tr></thead><tbody>
          {members.results.map((item) => <tr key={item.id}><td><strong dir="ltr">{item.username}</strong></td>
            <td><span className="badge">{labels[item.role] || item.role}</span></td>
            <td><div className="cmsTeamActions"><button type="button" className="btn secondary small" onClick={() => { setEdit(item); setEditRole(item.role); }}>تغییر نقش</button>
              <button type="button" className="btn secondary small" disabled={busy} onClick={() => revoke(item)}>لغو دسترسی</button></div></td></tr>)}
        </tbody></table></div>
      : <p className="cmsSitesEmpty">عضوی برای نمایش وجود ندارد.</p>}
      <nav className="cmsSitePagination" aria-label="صفحه‌بندی اعضا">
        <button type="button" className="btn secondary small" disabled={loading || !members?.previous} onClick={() => setPage((n) => Math.max(1, n - 1))}>قبلی</button>
        <span>صفحه {page.toLocaleString("fa-IR")}</span>
        <button type="button" className="btn secondary small" disabled={loading || !members?.next} onClick={() => setPage((n) => n + 1)}>بعدی</button>
      </nav>
    </section>
    <div className="cmsTeamEditors">
      <section className="panel">
        <h2>افزودن عضو موجود</h2>
        <form className="cmsSitesForm" onSubmit={addMember}>
          <label className="field"><span>نام کاربری Django</span><input dir="ltr" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="existing-username" /></label>
          <label className="field"><span>نقش</span><select value={role} onChange={(event) => setRole(event.target.value)}>{roles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <button type="submit" className="btn" disabled={!organization || busy}>{busy ? "در حال ثبت..." : "افزودن به سازمان"}</button>
        </form>
      </section>
      {edit && <section className="panel">
        <h2>ویرایش نقش {edit.username}</h2>
        <div className="cmsSitesForm">
          <label className="field"><span>نقش جدید</span><select value={editRole} onChange={(event) => setEditRole(event.target.value)}>
            {roles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <div className="cmsTeamActions"><button className="btn" type="button" onClick={saveRole} disabled={busy}>ذخیره نقش</button>
            <button className="btn secondary" type="button" onClick={() => setEdit(null)}>انصراف</button></div>
          <small>فقط مالک می‌تواند نقش مالک دیگری را تغییر دهد. حذف یا تنزل آخرین مالک مجاز نیست.</small>
        </div>
      </section>}
    </div>
  </>;
}
