import { allSchemaJsonLd, jsonLdScriptProps, toNextMetadata } from "@digitalafarin/cms-next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { cms } from "__CMS_LIB__";
import { DigitalAfarinBlockRenderer } from "__CMS_RENDERER__";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ cms_preview?: string }> };

function routeSlug(value: string) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

async function resolve(props: Props) {
  const { slug } = await props.params;
  const { cms_preview } = await props.searchParams;
  const path = `__CMS_COLLECTION__/${routeSlug(slug)}/`;
  const page = await cms.resolveForRoute(path, { previewToken: cms_preview });
  if (page) return page;
  const rule = await cms.resolveRedirect(path);
  if (rule.match && rule.destination) {
    if (rule.type === 301 || rule.type === 308) permanentRedirect(rule.destination);
    redirect(rule.destination);
  }
  // Existing hosts can call their legacy loader here, only after this public CMS miss.
  notFound();
}
export async function generateMetadata(props: Props) {
  return toNextMetadata(await resolve(props));
}
export default async function CmsArticle(props: Props) {
  const page = await resolve(props);
  return <main><h1>{page.content.title}</h1>{typeof page.content.custom_fields.featured_image === "string" && page.content.custom_fields.featured_image && <img src={page.content.custom_fields.featured_image} alt="" />}<DigitalAfarinBlockRenderer blocks={page.blocks} />
    {allSchemaJsonLd(page).map((schema, index) => <script key={index} {...jsonLdScriptProps(schema)} />)}
  </main>;
}
