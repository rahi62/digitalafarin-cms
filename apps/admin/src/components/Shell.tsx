"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { sessionStatus } from "@/lib/api";
import { adminPath, stripAdminBasePath } from "@/lib/admin-path";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const path = stripAdminBasePath(pathname || "/");
  const [state, setState] = useState<"checking" | "ready" | "error">("checking");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Erase readable JWTs left by versions before HttpOnly sessions.
    try { localStorage.removeItem("cms_access_token"); localStorage.removeItem("cms_refresh_token"); } catch { /* storage may be disabled */ }
    if (path === "/login") return;
    let alive = true;
    setState("checking");
    sessionStatus()
      .then((valid) => {
        if (!alive) return;
        if (!valid) window.location.replace(adminPath("/login"));
        else setState("ready");
      })
      .catch((cause) => {
        if (!alive) return;
        setMessage(cause instanceof Error ? cause.message : "وضعیت نشست قابل بررسی نیست.");
        setState("error");
      });
    return () => { alive = false; };
  }, [path, attempt]);

  if (path === "/login") return <>{children}</>;
  if (state === "checking") return <div className="cmsSessionGate" role="status">در حال بررسی نشست امن CMS...</div>;
  if (state === "error") return <div className="cmsSessionGate" role="alert">
    <p>{message}</p>
    <button type="button" className="btn" onClick={() => setAttempt((v) => v + 1)}>بررسی مجدد اتصال</button>
  </div>;
  return <div className="appShell"><Sidebar/><main className="main">{children}</main></div>;
}
