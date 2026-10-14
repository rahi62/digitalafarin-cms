"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, logout } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";

type Session = {
  id: string;
  current: boolean;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  active: boolean;
  device: string;
};
type Inventory = { current_session_id: string | null; results: Session[] };

function formatted(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}
export default function SessionsPage() {
  const [data, setData] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = await apiFetch<Inventory>("/auth/sessions/");
      setData(result); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "دریافت نشست‌ها انجام نشد.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function revoke(path: string, message: string) {
    if (working || !window.confirm(message)) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const result = await apiFetch<{ current_revoked: boolean; revoked_count?: number }>(
        path, { method: "POST", body: JSON.stringify(path.endsWith("revoke-all/") ? { confirm: true } : {}) },
      );
      if (result.current_revoked) {
        await logout();
        window.location.replace(adminPath("/login"));
        return;
      }
      setNotice("نشست‌های انتخاب‌شده در سرور باطل شدند. توکن‌های قبلی دیگر اجازه دسترسی به APIهای CMS را ندارند.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ابطال نشست انجام نشد.");
    } finally { setWorking(false); }
  }

  return <>
    <PageHeader title="نشست‌ها و دستگاه‌های من"
      description="مشاهده نشست‌های حساب و قطع دسترسی دستگاه‌های دیگر" />
    <div className="panel cmsSessionToolbar">
      <div>
        <strong>مدیریت امنیت ورود</strong>
        <p>ابطال نشست در Django اعمال می‌شود و درخواست بعدی دستگاه با توکن قبلی رد خواهد شد. نشست‌های قدیمی بدون شناسه قابل شناسایی ممکن است نیازمند ورود مجدد باشند.</p>
      </div>
      <div className="cmsSessionActions">
        <button type="button" className="btn secondary" disabled={working || loading}
          onClick={() => revoke("/auth/sessions/revoke-others/", "همه دستگاه‌های دیگر از حساب خارج شوند؟")}>خروج از دستگاه‌های دیگر</button>
        <button type="button" className="btn" disabled={working || loading}
          onClick={() => revoke("/auth/sessions/revoke-all/", "همه نشست‌ها، از جمله همین دستگاه، فوراً باطل شوند؟")}>خروج از همه دستگاه‌ها</button>
      </div>
    </div>
    {error && <div role="alert" className="error">{error}</div>}
    {notice && <div role="status" className="notice">{notice}</div>}
    <section className="panel cmsSessionList" aria-label="فهرست نشست‌ها">
      <div className="cmsSessionHeader"><h2>نشست‌های اخیر</h2>
        <button type="button" className="btn secondary small" disabled={loading || working} onClick={() => void load()}>به‌روزرسانی</button>
      </div>
      {loading && <p role="status">در حال بارگذاری...</p>}
      {!loading && !data?.results.length && <p>نشستی برای نمایش وجود ندارد.</p>}
      {data?.results.map((session) => <article key={session.id} className="cmsSessionItem">
        <div className="cmsSessionMain">
          <strong>{session.device}</strong>
          <span>{session.current ? "این دستگاه" : session.active ? "فعال" : session.revoked_at ? "باطل‌شده" : "منقضی‌شده"}</span>
          <small>ورود: {formatted(session.created_at)} | آخرین فعالیت: {formatted(session.last_seen_at)}</small>
        </div>
        {session.active && <button type="button" className="btn secondary small" disabled={working}
          onClick={() => revoke(`/auth/sessions/${session.id}/revoke/`,
            session.current ? "نشست همین دستگاه باطل شود؟" : "دسترسی این دستگاه فوراً قطع شود؟")}>قطع دسترسی</button>}
      </article>)}
    </section>
  </>;
}
