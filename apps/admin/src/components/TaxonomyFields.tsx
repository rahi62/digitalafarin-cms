"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, Paginated } from "@/lib/api";

type Category = { id: string; site: string; name: string; slug: string; parent: string | null };
type Tag = { id: string; site: string; name: string; slug: string };

type Props = {
  siteId?: string;
  categories: string[];
  tags: string[];
  onCategoriesChange: (ids: string[]) => void;
  onTagsChange: (ids: string[]) => void;
};

export default function TaxonomyFields({
  siteId,
  categories,
  tags,
  onCategoriesChange,
  onTagsChange,
}: Props) {
  const [categoryRows, setCategoryRows] = useState<Category[]>([]);
  const [tagRows, setTagRows] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!siteId) {
      setCategoryRows([]);
      setTagRows([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      apiFetch<Paginated<Category>>(`/content/categories/?site=${encodeURIComponent(siteId)}`),
      apiFetch<Paginated<Tag>>(`/content/tags/?site=${encodeURIComponent(siteId)}`),
    ]).then(([categoryData, tagData]) => {
      if (cancelled) return;
      setCategoryRows(categoryData.results);
      setTagRows(tagData.results);
    }).catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : "خطا در بارگذاری دسته‌ها و تگ‌ها");
    });
    return () => { cancelled = true; };
  }, [siteId]);

  const categoryMap = useMemo(() => new Map(categoryRows.map((item) => [item.id, item])), [categoryRows]);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredTags = useMemo(
    () => tagRows.filter((tag) => !normalizedSearch || tag.name.toLowerCase().includes(normalizedSearch) || tag.slug.toLowerCase().includes(normalizedSearch)),
    [tagRows, normalizedSearch],
  );

  function toggle(list: string[], id: string, onChange: (ids: string[]) => void) {
    onChange(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  function categoryDepth(category: Category) {
    let depth = 0;
    let current = category.parent ? categoryMap.get(category.parent) : undefined;
    const seen = new Set<string>();
    while (current && depth < 4 && !seen.has(current.id)) {
      seen.add(current.id);
      depth += 1;
      current = current.parent ? categoryMap.get(current.parent) : undefined;
    }
    return depth;
  }

  return (
    <section className="taxonomyFields field full">
      <div className="taxonomyFieldsHeader">
        <div><strong>Taxonomies</strong><span>دسته‌بندی و برچسب‌های محتوا</span></div>
        <Link href="/taxonomies" target="_blank" className="textButton">مدیریت دسته‌ها و تگ‌ها ↗</Link>
      </div>
      {message && <div className="error">{message}</div>}
      <div className="taxonomyColumns">
        <div className="taxonomyBox">
          <div className="taxonomyBoxTitle"><strong>Categories</strong><span>{categories.length} انتخاب</span></div>
          <div className="categoryChecklist">
            {categoryRows.map((category) => (
              <label key={category.id} style={{ paddingRight: `${categoryDepth(category) * 16 + 8}px` }}>
                <input type="checkbox" checked={categories.includes(category.id)} onChange={() => toggle(categories, category.id, onCategoriesChange)} />
                <span>{category.name}</span>
                <small>/{category.slug}</small>
              </label>
            ))}
            {categoryRows.length === 0 && <div className="taxonomyEmpty">دسته‌ای ساخته نشده است.</div>}
          </div>
        </div>

        <div className="taxonomyBox">
          <div className="taxonomyBoxTitle"><strong>Tags</strong><span>{tags.length} انتخاب</span></div>
          <input className="taxonomySearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جستجوی تگ..." />
          <div className="tagChecklist">
            {filteredTags.map((tag) => (
              <button type="button" key={tag.id} className={tags.includes(tag.id) ? "selected" : ""} onClick={() => toggle(tags, tag.id, onTagsChange)}>
                {tag.name}
              </button>
            ))}
            {filteredTags.length === 0 && <div className="taxonomyEmpty">تگی پیدا نشد.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
