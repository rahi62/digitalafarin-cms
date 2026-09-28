import { cms } from "__CMS_LIB__";
import { isCmsNotFoundError } from "@digitalafarin/cms-next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function CmsCollection({ searchParams }: { searchParams: Promise<{ page?: string; search?: string; category?: string }> }) {
  const query = await searchParams;
  const pageNumber = Number(query.page || 1);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) notFound();
  let entries;
  try { entries = await cms.listEntries({ content_type: "__CMS_TYPE__", page: pageNumber, search: query.search, category: query.category }); }
  catch (error) { if (isCmsNotFoundError(error)) notFound(); throw error; }
  function pageLink(page: number) {
    const params = new URLSearchParams({ page: String(page) });
    if (query.search) params.set("search", query.search);
    if (query.category) params.set("category", query.category);
    return `__CMS_COLLECTION__?${params}`;
  }
  return <main><h1>__CMS_TYPE__</h1>
    <form><input name="search" aria-label="Search" defaultValue={query.search} /><button>Search</button></form>
    {entries.results.map((entry) => <article key={entry.id}>{typeof entry.custom_fields.featured_image === "string" && entry.custom_fields.featured_image && <img src={entry.custom_fields.featured_image} alt="" />}<h2><a href={entry.path}>{entry.title}</a></h2><p>{entry.excerpt}</p></article>)}
    {entries.count === 0 && <p>No published content yet.</p>}
    <nav aria-label="Pagination">{entries.previous && <a href={pageLink(entries.previous)}>Previous</a>} {entries.next && <a href={pageLink(entries.next)}>Next</a>}</nav>
  </main>;
}
