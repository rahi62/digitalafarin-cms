"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearTokens } from "@/lib/api";
const links=[
  ["/","داشبورد","◫"],["/content","محتوا","✎"],["/seo","سئو صفحات","◎"],["/keywords","کلمات کلیدی","⌕"],["/redirects","ریدایرکت‌ها","↪"],["/audit","SEO Audit","✓"]
];
export default function Sidebar(){const path=usePathname();return <aside className="sidebar"><div className="brand"><div className="brandMark">D</div><div><strong>DigitalAfarin</strong><span>SEO CMS</span></div></div><nav>{links.map(([href,label,icon])=><Link key={href} href={href} className={path===href|| (href!=="/"&&path.startsWith(href))?"active":""}><b>{icon}</b>{label}</Link>)}</nav><button className="logout" onClick={()=>{clearTokens();location.href="/login"}}>خروج</button></aside>}
