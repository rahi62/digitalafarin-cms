"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string; domain: string };
type Menu = { id?: string; site: string; name: string; key: string; items?: MenuItem[] };
type MenuItem = {
  id?: string;
  menu: string;
  label: string;
  url: string;
  parent: string | null;
  sort_order: number;
  is_external: boolean;
};
type Entry = { id: string; site: string; title: string; path: string; status: string };

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s_-]+/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

function emptyMenu(site = ""): Menu {
  return { site, name: "", key: "" };
}

function emptyItem(menu = "", sortOrder = 0): MenuItem {
  return { menu, label: "", url: "", parent: null, sort_order: sortOrder, is_external: false };
}

export default function MenusPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [menus, setMenus] = useState<Menu[]>([]);
  const [menu, setMenu] = useState<Menu>(() => emptyMenu());
  const [items, setItems] = useState<MenuItem[]>([]);
  const [item, setItem] = useState<MenuItem>(() => emptyItem());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [message, setMessage] = useState("");

  async function loadMenus(siteId = site) {
    if (!siteId) return;
    const data = await apiFetch<Paginated<Menu>>(`/content/menus/?site=${encodeURIComponent(siteId)}`);
    setMenus(data.results);
    return data.results;
  }

  async function loadItems(menuId = menu.id) {
    if (!menuId) {
      setItems([]);
      return;
    }
    const data = await apiFetch<Paginated<MenuItem>>(`/content/menu-items/?menu=${encodeURIComponent(menuId)}&ordering=sort_order`);
    setItems(data.results);
  }

  async function loadEntries(siteId = site) {
    if (!siteId) return;
    const data = await apiFetch<Paginated<Entry>>(`/content/entries/?site=${encodeURIComponent(siteId)}&ordering=title`);
    setEntries(data.results);
  }

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/").then((data) => {
      setSites(data.results);
      if (data.results[0]) setSite(data.results[0].id);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری سایت‌ها"));
  }, []);

  useEffect(() => {
    if (!site) return;
    Promise.all([loadMenus(site), loadEntries(site)]).then(([menuRows]) => {
      const first = menuRows?.[0];
      if (first?.id) {
        setMenu(first);
        setItem(emptyItem(first.id));
        loadItems(first.id);
      } else {
        setMenu(emptyMenu(site));
        setItems([]);
        setItem(emptyItem());
      }
    }).catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری منوها"));
  }, [site]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)), [items]);
  const roots = sortedItems.filter((row) => !row.parent);
  const children = (parentId?: string) => sortedItems.filter((row) => row.parent === parentId);

  function selectMenu(next: Menu) {
    setMenu(next);
    setItem(emptyItem(next.id || "", items.length));
    loadItems(next.id);
  }

  async function saveMenu() {
    if (!site || !menu.name.trim() || !menu.key.trim()) return setMessage("نام و key منو الزامی است");
    try {
      const payload = { site, name: menu.name.trim(), key: menu.key.trim() };
      const saved = menu.id
        ? await apiFetch<Menu>(`/content/menus/${menu.id}/`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch<Menu>("/content/menus/", { method: "POST", body: JSON.stringify(payload) });
      setMenu(saved);
      setItem(emptyItem(saved.id || ""));
      setMessage("منو ذخیره شد");
      await loadMenus(site);
      await loadItems(saved.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره منو");
    }
  }

  async function deleteMenu() {
    if (!menu.id || !window.confirm(`منوی «${menu.name}» حذف شود؟`)) return;
    try {
      await apiFetch(`/content/menus/${menu.id}/`, { method: "DELETE" });
      setMessage("منو حذف شد");
      const rows = await loadMenus(site);
      const first = rows?.[0];
      if (first?.id) selectMenu(first);
      else { setMenu(emptyMenu(site)); setItems([]); setItem(emptyItem()); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در حذف منو");
    }
  }

  async function saveItem() {
    if (!menu.id) return setMessage("ابتدا منو را ذخیره کنید");
    if (!item.label.trim() || !item.url.trim()) return setMessage("Label و URL آیتم الزامی است");
    try {
      const payload = { ...item, menu: menu.id, parent: item.parent || null };
      const saved = item.id
        ? await apiFetch<MenuItem>(`/content/menu-items/${item.id}/`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch<MenuItem>("/content/menu-items/", { method: "POST", body: JSON.stringify(payload) });
      setItem(saved);
      setMessage("آیتم منو ذخیره شد");
      await loadItems(menu.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره آیتم");
    }
  }

  async function deleteItem() {
    if (!item.id || !window.confirm(`آیتم «${item.label}» حذف شود؟`)) return;
    try {
      await apiFetch(`/content/menu-items/${item.id}/`, { method: "DELETE" });
      setItem(emptyItem(menu.id || "", items.length));
      setMessage("آیتم حذف شد");
      await loadItems(menu.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در حذف آیتم");
    }
  }

  async function move(row: MenuItem, direction: -1 | 1) {
    if (!row.id) return;
    const siblings = sortedItems.filter((candidate) => candidate.parent === row.parent);
    const index = siblings.findIndex((candidate) => candidate.id === row.id);
    const target = siblings[index + direction];
    if (!target?.id) return;
    try {
      await Promise.all([
        apiFetch(`/content/menu-items/${row.id}/`, { method: "PATCH", body: JSON.stringify({ sort_order: target.sort_order }) }),
        apiFetch(`/content/menu-items/${target.id}/`, { method: "PATCH", body: JSON.stringify({ sort_order: row.sort_order }) }),
      ]);
      await loadItems(menu.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در جابه‌جایی آیتم");
    }
  }

  function chooseEntry(entryId: string) {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    setItem({ ...item, label: entry.title, url: entry.path, is_external: false });
  }

  function renderRow(row: MenuItem, depth = 0): React.ReactNode {
    const siblings = sortedItems.filter((candidate) => candidate.parent === row.parent);
    const index = siblings.findIndex((candidate) => candidate.id === row.id);
    return (
      <div key={row.id || `${row.label}-${depth}`}>
        <button type="button" className={`menuTreeRow ${item.id === row.id ? "active" : ""}`} style={{ paddingRight: `${depth * 22 + 10}px` }} onClick={() => setItem(row)}>
          <span className="menuTreeHandle">{depth ? "↳" : "≡"}</span>
          <span><strong>{row.label}</strong><code dir="ltr">{row.url}</code></span>
          <small>{row.is_external ? "External" : "Internal"}</small>
          <span className="menuTreeMoves" onClick={(event) => event.stopPropagation()}>
            <b role="button" aria-label="move up" className={index === 0 ? "disabled" : ""} onClick={() => index > 0 && move(row, -1)}>↑</b>
            <b role="button" aria-label="move down" className={index === siblings.length - 1 ? "disabled" : ""} onClick={() => index < siblings.length - 1 && move(row, 1)}>↓</b>
          </span>
        </button>
        {row.id && children(row.id).map((child) => renderRow(child, depth + 1))}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Menu Builder" description="ساخت منوهای چندسطحی و اتصال مستقیم به محتوای سایت" action={<button className="btn" onClick={() => { setMenu(emptyMenu(site)); setItems([]); setItem(emptyItem()); }}>+ منوی جدید</button>} />
      {message && <div className={message.includes("شد") ? "notice" : "error"}>{message}</div>}
      <div className="menuBuilderLayout">
        <aside className="panel menuListPanel">
          <div className="field"><label>سایت</label><select value={site} onChange={(e) => setSite(e.target.value)}>{sites.map((row) => <option key={row.id} value={row.id}>{row.name} — {row.domain}</option>)}</select></div>
          <div className="menuListTitle"><strong>منوها</strong><span>{menus.length}</span></div>
          <div className="menuList">{menus.map((row) => <button key={row.id} className={menu.id === row.id ? "active" : ""} onClick={() => selectMenu(row)}><strong>{row.name}</strong><code>{row.key}</code></button>)}</div>
          <div className="menuDefinition">
            <div className="field"><label>نام منو</label><input value={menu.name} onChange={(e) => { const name=e.target.value; setMenu({ ...menu, name, key: menu.id || menu.key ? menu.key : slugify(name) }); }} /></div>
            <div className="field"><label>Key</label><input dir="ltr" value={menu.key} onChange={(e) => setMenu({ ...menu, key: slugify(e.target.value) })} placeholder="main-menu" /></div>
            <div className="actions"><button type="button" className="btn" onClick={saveMenu}>ذخیره منو</button>{menu.id && <button type="button" className="btn dangerBtn" onClick={deleteMenu}>حذف</button>}</div>
          </div>
        </aside>

        <section className="panel menuTreePanel">
          <div className="menuTreeHeader"><div><h2>{menu.name || "منوی جدید"}</h2><span>{items.length} آیتم</span></div>{menu.id && <button className="btn secondary small" onClick={() => setItem(emptyItem(menu.id || "", items.length))}>+ آیتم جدید</button>}</div>
          {!menu.id ? <div className="emptyState">ابتدا منو را نام‌گذاری و ذخیره کنید.</div> : roots.length === 0 ? <div className="emptyState">این منو هنوز آیتمی ندارد.</div> : <div className="menuTree">{roots.map((row) => renderRow(row))}</div>}
        </section>

        <aside className="panel menuItemEditor">
          <div className="menuItemEditorHeader"><h2>{item.id ? "ویرایش آیتم" : "آیتم جدید"}</h2>{item.id && <span className="badge">#{item.sort_order}</span>}</div>
          <div className="field"><label>انتخاب از محتوای داخلی</label><select defaultValue="" onChange={(e) => { chooseEntry(e.target.value); e.currentTarget.value=""; }}><option value="">انتخاب Entry...</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} — {entry.path}</option>)}</select></div>
          <div className="field"><label>Label</label><input value={item.label} onChange={(e) => setItem({ ...item, label: e.target.value })} /></div>
          <div className="field"><label>URL</label><input dir="ltr" value={item.url} onChange={(e) => setItem({ ...item, url: e.target.value })} placeholder="/about/ یا https://..." /></div>
          <div className="field"><label>Parent</label><select value={item.parent || ""} onChange={(e) => setItem({ ...item, parent: e.target.value || null })}><option value="">سطح اصلی</option>{items.filter((row) => row.id && row.id !== item.id).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></div>
          <div className="field"><label>Sort order</label><input type="number" value={item.sort_order} onChange={(e) => setItem({ ...item, sort_order: Number(e.target.value) })} /></div>
          <label className="menuExternal"><input type="checkbox" checked={item.is_external} onChange={(e) => setItem({ ...item, is_external: e.target.checked })} /><span><strong>External link</strong><small>برای لینک خارج از دامنه</small></span></label>
          <div className="actions"><button type="button" className="btn" disabled={!menu.id} onClick={saveItem}>ذخیره آیتم</button>{item.id && <button type="button" className="btn dangerBtn" onClick={deleteItem}>حذف</button>}</div>
        </aside>
      </div>
    </>
  );
}
