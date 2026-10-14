"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { BFF_ENABLED, CMS_AUTH_EVENTS, getAccessToken } from "@/lib/api";
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

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(CMS_AUTH_EVENTS);
    channel.onmessage = (event) => {
      if (event.data?.type === "signed-out") window.location.replace(adminPath("/login"));
    };
    return () => channel.close();
  }, []);

  if (path === "/login") return <>{children}</>;
  return <div className="appShell"><Sidebar/><main className="main">{children}</main></div>;
}
