"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { apiFetch, Paginated } from "@/lib/api";

type Site = { id: string; name: string; domain: string };
type Category = { id?: string; site: string; name: string; slug: string; parent: string | null };
type Tag = { id?: string; site: string; name: string; slug: string };

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9\s_-]+/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

export default function TaxonomiesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [category, setCategory] = useState<Category>({ site: "", name: "", slug: "", parent: null });
  const [tag, setTag] = useState<Tag>({ site: "", name: "", slug: "" });
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  async function load(siteId = site) {
    if (!siteId) return;
    try {
      const [categoryData, tagData] = await Promise.all([
        apiFetch<Paginated<Category>>(`/content/categories/?site=${encodeURIComponent(siteId)}`),
        apiFetch<Paginated<Tag>>(`/content/tags/?site=${encodeURIComponent(siteId)}`),
      ]);
      setCategories(categoryData.results);
      setTags(tagData.results);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در بارگذاری Taxonomyها");
    }
  }

  useEffect(() => {
    apiFetch<Paginated<Site>>("/sites/").then((data) => {
      setSites(data.results);
      if (data.results[0]) setSite(data.results[0].id);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "خطا در بارگذاری سایت‌ها"));
  }, []);

  useEffect(() => {
    if (!site) return;
    setCategory({ site, name: "", slug: "", parent: null });
    setTag({ site, name: "", slug: "" });
    load(site);
  }, [site]);

  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id || "", item])), [categories]);
  const query = search.trim().toLowerCase();
  const filteredCategories = categories.filter((item) => !query || item.name.toLowerCase().includes(query) || item.slug.toLowerCase().includes(query));
  const filteredTags = tags.filter((item) => !query || item.name.toLowerCase().includes(query) || item.slug.toLowerCase().includes(query));

  function categoryDepth(item: Category) {
    let depth = 0;
    let parent = item.parent ? categoryMap.get(item.parent) : undefined;
    const seen = new Set<string>();
    while (parent?.id && depth < 5 && !seen.has(parent.id)) {
      seen.add(parent.id);
      depth += 1;
      parent = parent.parent ? categoryMap.get(parent.parent) : undefined;
    }
    return depth;
  }

  async function saveCategory() {
    if (!category.name.trim() || !category.slug.trim()) return setMessage("نام و slug دسته الزامی است");
    try {
      const payload = { site, name: category.name.trim(), slug: category.slug.trim(), parent: category.parent || null };
      const saved = category.id
        ? await apiFetch<Category>(`/content/categories/${category.id}/`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch<Category>("/content/categories/", { method: "POST", body: JSON.stringify(payload) });
      setCategory(saved);
      setMessage("دسته ذخیره شد");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره دسته");
    }
  }

  async function saveTag() {
    if (!tag.name.trim() || !tag.slug.trim()) return setMessage("نام و slug تگ الزامی است");
    try {
      const payload = { site, name: tag.name.trim(), slug: tag.slug.trim() };
      const saved = tag.id
        ? await apiFetch<Tag>(`/content/tags/${tag.id}/`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiFetch<Tag>("/content/tags/", { method: "POST", body: JSON.stringify(payload) });
      setTag(saved);
      setMessage("تگ ذخیره شد");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطا در ذخیره تگ");
    }
  }

  async function remove(kind: "category" | "tag", id?: string) {
    if (!id || !window.confirm("این مورد حذف شود؟")) return;
    try {
      await apiFetch(`/content/${kind === "category" ? "categories" : "tags"}/${id}/`, { method: "DELETE" });
      if (kind === "category") setCategory({ site, name: "", slug: "", parent: null });
      else setTag({ site, name: "", slug: "" });
      setMessage("حذف شد");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حذف انجام نشد");
    }
  }

  return (
    <>
      <PageHeader title="Categories & Tags" description="مدیریت ساختار دسته‌بندی و برچسب‌های هر سایت" />
      {message && <div className={message.includes("شد") ? "notice" : "error"}>{message}</div>}
      <div className="taxonomyTopbar panel">
        <div className="field"><label>سایت</label><select value={site} onChange={(e) => setSite(e.target.value)}>{sites.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.domain}</option>)}</select></div>
        <div className="field"><label>جستجو</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="نام یا slug..." /></div>
      </div>

      <div className="taxonomyManagerGrid">
        <section className="panel taxonomyManagerPanel">
          <div className="taxonomyManagerHeader"><div><h2>Categories</h2><span>{categories.length} دسته</span></div><button className="btn secondary small" onClick={() => setCategory({ site, name: "", slug: "", parent: null })}>+ جدید</button></div>
          <div className="taxonomyList">
            {filteredCategories.map((item) => (
              <button key={item.id} className={category.id === item.id ? "active" : ""} style={{ paddingRight: `${categoryDepth(item) * 18 + 10}px` }} onClick={() => setCategory(item)}>
                <strong>{item.name}</strong><code>/{item.slug}</code>{item.parent && <small>↳ {categoryMap.get(item.parent)?.name || "Parent"}</small>}
              </button>
            ))}
          </div>
          <div className="taxonomyEditor">
            <div className="field"><label>نام دسته</label><input value={category.name} onChange={(e) => { const name=e.target.value; setCategory({ ...category, name, slug: category.id || category.slug ? category.slug : slugify(name) }); }} /></div>
            <div className="field"><label>Slug</label><input dir="ltr" value={category.slug} onChange={(e) => setCategory({ ...category, slug: slugify(e.target.value) })} /></div>
            <div className="field"><label>Parent</label><select value={category.parent || ""} onChange={(e) => setCategory({ ...category, parent: e.target.value || null })}><option value="">بدون والد</option>{categories.filter((item) => item.id !== category.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
            <div className="actions"><button type="button" className="btn" onClick={saveCategory}>ذخیره دسته</button>{category.id && <button type="button" className="btn dangerBtn" onClick={() => remove("category", category.id)}>حذف</button>}</div>
          </div>
        </section>

        <section className="panel taxonomyManagerPanel">
          <div className="taxonomyManagerHeader"><div><h2>Tags</h2><span>{tags.length} تگ</span></div><button className="btn secondary small" onClick={() => setTag({ site, name: "", slug: "" })}>+ جدید</button></div>
          <div className="taxonomyList tagList">
            {filteredTags.map((item) => <button key={item.id} className={tag.id === item.id ? "active" : ""} onClick={() => setTag(item)}><strong>{item.name}</strong><code>/{item.slug}</code></button>)}
          </div>
          <div className="taxonomyEditor">
            <div className="field"><label>نام تگ</label><input value={tag.name} onChange={(e) => { const name=e.target.value; setTag({ ...tag, name, slug: tag.id || tag.slug ? tag.slug : slugify(name) }); }} /></div>
            <div className="field"><label>Slug</label><input dir="ltr" value={tag.slug} onChange={(e) => setTag({ ...tag, slug: slugify(e.target.value) })} /></div>
            <div className="actions"><button type="button" className="btn" onClick={saveTag}>ذخیره تگ</button>{tag.id && <button type="button" className="btn dangerBtn" onClick={() => remove("tag", tag.id)}>حذف</button>}</div>
          </div>
        </section>
      </div>
    </>
  );
}
