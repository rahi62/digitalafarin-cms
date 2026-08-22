"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearTokens } from "@/lib/api";
const links=[
  ["/","داشبورد","◫"],
  ["/content","محتوا","✎"],
  ["/content-types","ساختار محتوا","◇"],
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
];
function isActive(path:string,href:string){return href==="/"?path==="/":path===href||path.startsWith(`${href}/`)}
export default function Sidebar(){const path=usePathname();return <aside className="sidebar"><div className="brand"><div className="brandMark">D</div><div><strong>DigitalAfarin</strong><span>SEO CMS</span></div></div><nav>{links.map(([href,label,icon])=><Link key={href} href={href} className={isActive(path,href)?"active":""}><b>{icon}</b>{label}</Link>)}</nav><button className="logout" onClick={()=>{clearTokens();location.href="/login"}}>خروج</button></aside>}
