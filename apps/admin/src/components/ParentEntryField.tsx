"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, Paginated } from "@/lib/api";

type Entry = { id: string; site: string; title: string; path: string; parent: string | null; status: string };

type Props = {
  siteId?: string;
  entryId?: string;
  value: string | null;
  onChange: (value: string | null) => void;
};

export default function ParentEntryField({ siteId, entryId, value, onChange }: Props) {
  const [rows, setRows] = useState<Entry[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!siteId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    apiFetch<Paginated<Entry>>(`/content/entries/?site=${encodeURIComponent(siteId)}&ordering=title`)
      .then((data) => {
        if (!cancelled) setRows(data.results.filter((item) => item.id !== entryId));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "خطا در بارگذاری ساختار صفحات");
      });
    return () => { cancelled = true; };
  }, [siteId, entryId]);

  const byId = useMemo(() => new Map(rows.map((item) => [item.id, item])), [rows]);

  function depth(item: Entry) {
    let result = 0;
    let current = item.parent ? byId.get(item.parent) : undefined;
    const seen = new Set<string>();
    while (current && result < 5 && !seen.has(current.id)) {
      seen.add(current.id);
      result += 1;
      current = current.parent ? byId.get(current.parent) : undefined;
    }
    return result;
  }

  return (
    <div className="field">
      <label>صفحه والد</label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">بدون والد</option>
        {rows.map((item) => <option key={item.id} value={item.id}>{`${"— ".repeat(depth(item))}${item.title} · ${item.path}`}</option>)}
      </select>
      {message ? <small className="fieldError">{message}</small> : <small>برای ساخت breadcrumb و ساختار سلسله‌مراتبی محتوا.</small>}
    </div>
  );
}
