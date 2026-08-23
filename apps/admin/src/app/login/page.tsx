"use client";

import { FormEvent, useState } from "react";
import { login } from "@/lib/api";
import { adminPath } from "@/lib/admin-path";

export default function LoginPage(){
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [submitting,setSubmitting]=useState(false);

  async function submit(e:FormEvent){
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try{
      await login(username,password);
      window.location.href=adminPath("/");
    }catch(err:any){
      setError(err.message);
    }finally{
      setSubmitting(false);
    }
  }

  return <div className="loginPage"><form className="loginCard" onSubmit={submit}>
    <h1>ورود به SEO CMS</h1>
    <p>پنل مدیریت محتوای DigitalAfarin</p>
    {error&&<div className="error">{error}</div>}
    <div className="field"><label>نام کاربری</label><input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></div>
    <div className="field"><label>رمز عبور</label><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></div>
    <button className="btn" style={{width:"100%"}} disabled={submitting||!username||!password}>{submitting?"در حال ورود...":"ورود"}</button>
  </form></div>
}
