"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { BFF_ENABLED, getAccessToken } from "@/lib/api";
import { adminPath, stripAdminBasePath } from "@/lib/admin-path";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const path = stripAdminBasePath(pathname || "/");

  useEffect(() => {
    if (path === "/login") return;
    if (!BFF_ENABLED && !getAccessToken()) {
      window.location.href = adminPath("/login");
    } else if (BFF_ENABLED) {
      fetch(adminPath("/auth/session/status"), { credentials: "same-origin", cache: "no-store" })
        .then((response) => response.json())
        .then((status) => { if (!status.hasSession) window.location.replace(adminPath("/login")); })
        .catch(() => { /* API requests will fail closed if session is unavailable. */ });
    }
  }, [path]);

  if (path === "/login") return <>{children}</>;
  return <div className="appShell"><Sidebar/><main className="main">{children}</main></div>;
}
