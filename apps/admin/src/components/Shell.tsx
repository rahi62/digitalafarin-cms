"use client";
import { useEffect } from "react"; import { usePathname } from "next/navigation"; import Sidebar from "./Sidebar"; import { getAccessToken } from "@/lib/api";
export default function Shell({children}:{children:React.ReactNode}){const path=usePathname(); useEffect(()=>{if(path!=="/login"&&!getAccessToken()) location.href="/login"},[path]); if(path==="/login") return <>{children}</>; return <div className="appShell"><Sidebar/><main className="main">{children}</main></div>}
