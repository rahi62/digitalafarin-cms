import { adminPath } from "@/lib/admin-path";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || adminPath("/api-proxy");

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cms_access_token");
}
export function setTokens(access:string, refresh:string) {
  localStorage.setItem("cms_access_token", access); localStorage.setItem("cms_refresh_token", refresh);
}
export function clearTokens(){ localStorage.removeItem("cms_access_token"); localStorage.removeItem("cms_refresh_token"); }
export async function login(username:string,password:string){
  const res=await fetch(`${API_URL}/auth/token/`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
  if(!res.ok) throw new Error("نام کاربری یا رمز عبور نادرست است");
  const data=await res.json(); setTokens(data.access,data.refresh); return data;
}
export async function apiFetch<T=any>(path:string, options:RequestInit={}):Promise<T>{
  const token=getAccessToken();
  const headers=new Headers(options.headers || {}); if(!(options.body instanceof FormData)) headers.set("Content-Type","application/json"); if(token) headers.set("Authorization",`Bearer ${token}`);
  const res=await fetch(`${API_URL}${path}`,{...options,headers,cache:"no-store"});
  if(res.status===401 && typeof window!=="undefined") { clearTokens(); window.location.href=adminPath("/login"); throw new Error("Unauthorized"); }
  if(!res.ok){ let message=`API error ${res.status}`; try{const e=await res.json(); message=e.detail || JSON.stringify(e);}catch{} throw new Error(message); }
  if(res.status===204) return undefined as T;
  const body=await res.text();
  return (body ? JSON.parse(body) : undefined) as T;
}
export type Paginated<T>={count:number;next:string|null;previous:string|null;results:T[]};
