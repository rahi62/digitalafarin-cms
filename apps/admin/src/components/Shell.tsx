"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { getAccessToken } from "@/lib/api";
import { adminPath, stripAdminBasePath } from "@/lib/admin-path";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const path = stripAdminBasePath(pathname || "/");

  useEffect(() => {
    if (path !== "/login" && !getAccessToken()) {
      window.location.href = adminPath("/login");
    }
  }, [path]);

  if (path === "/login") return <>{children}</>;
  return <div className="appShell"><Sidebar/><main className="main">{children}</main></div>;
}
