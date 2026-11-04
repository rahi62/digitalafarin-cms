import { allSchemaJsonLd, jsonLdScriptProps, toNextMetadata } from "@digitalafarin/cms-next";
import { resolveCmsPageCached } from "@digitalafarin/cms-next/cache";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { DigitalAfarinBlockRenderer } from "../../components/digitalafarin-cms/BlockRenderer";

// Cache Components: CMS content is resolved through the Next.js cache (tagged, revalidated by the
// CMS webhook) *before* streaming starts, so missing pages answer 404 and redirects answer 307/308.
// Previews never reach this route: withDigitalAfarinCms rewrites them to /digitalafarin-cms-preview.

function cmsPath(segments?: string[]) {
  return segments?.length ? `/${segments.join("/")}/` : "/";
}

__CMS_SEGMENT_CONFIG__

const RESERVED = ["media", "api", "_next", "static"];

async function load(params: Promise<{ cms_path?: string[] }>) {
  const segments = (await params).cms_path;
  if (RESERVED.includes(segments?.[0] || "")) notFound();
  return resolveCmsPageCached(cmsPath(segments));
}

export async function generateMetadata({ params }: { params: Promise<{ cms_path?: string[] }> }) {
  const result = await load(params);
  return result.kind === "page" ? toNextMetadata(result.page) : {};
}

export default async function DigitalAfarinCmsPage({ params }: { params: Promise<{ cms_path?: string[] }> }) {
  const result = await load(params);
  if (result.kind === "redirect") {
    if (result.type === 301 || result.type === 308) permanentRedirect(result.destination);
    redirect(result.destination);
  }
  if (result.kind === "missing") notFound();
  const page = result.page;

  return (
    <>
      <DigitalAfarinBlockRenderer blocks={page.blocks} />
      {allSchemaJsonLd(page).map((schema, index) => (
        <script
          key={`${String(schema["@type"] || "schema")}-${index}`}
          {...jsonLdScriptProps(schema)}
        />
      ))}
    </>
  );
}
