"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clearTokens } from "@/lib/api";
import { adminPath, stripAdminBasePath } from "@/lib/admin-path";

const links=[
  ["/","داشبورد","◫"],
  ["/content","محتوا","✎"],
  ["/sites","مدیریت سایت‌ها","▣"],
  ["/content-types","ساختار محتوا","◇"],
  ["/reusable-blocks","بلوک‌های آماده","▦"],
  ["/route-explorer","کاوشگر مسیرها","◎"],
  ["/taxonomies","دسته‌ها و تگ‌ها","#"],
  ["/menus","منوها","☰"],
  ["/media","رسانه","▧"],
  ["/seo","سئو صفحات","◎"],
  ["/opportunities","SEO Opportunities","★"],
  ["/keywords","کلمات کلیدی","⌕"],
  ["/redirects","ریدایرکت‌ها","↪"],
  ["/audit","SEO Audit","✓"],
  ["/audit-trends","Audit Trends","↗"],
  ["/search-performance","Search Performance","⌁"],
  ["/settings","تنظیمات سایت","⚙"]
] as const;

function isActive(path:string,href:string){return href==="/"?path==="/":path===href||path.startsWith(`${href}/`)}

export default function Sidebar(){
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = stripAdminBasePath(pathname || "/");

  useEffect(() => { setOpen(false); }, [pathname]);

  return <aside className={open ? "sidebar mobileExpanded" : "sidebar"}>
    <div className="sidebarTop">
      <div className="brand"><div className="brandMark">D</div><div><strong>DigitalAfarin</strong><span>SEO CMS</span></div></div>
      <button type="button" className="mobileMenuToggle" onClick={() => setOpen((value) => !value)}
        aria-expanded={open} aria-controls="cms-admin-main-nav" aria-label={open ? "بستن منو" : "بازکردن منو"}>
        {open ? "✕" : "☰"} <span>منو</span>
      </button>
    </div>
    <nav id="cms-admin-main-nav" className={open ? "sidebarNav isOpen" : "sidebarNav"}
      aria-label="ناوبری مدیریت محتوا">{links.map(([href,label,icon])=>
        <Link key={href} href={adminPath(href)} className={isActive(current,href)?"active":""}><b>{icon}</b>{label}</Link>
      )}</nav>
    <button className="logout" onClick={()=>{clearTokens();window.location.href=adminPath("/login")}}>خروج</button>
  </aside>;
}
