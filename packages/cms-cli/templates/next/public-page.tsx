import {
  allSchemaJsonLd,
  isCmsNotFoundError,
  jsonLdScriptProps,
  toNextMetadata,
} from "@digitalafarin/cms-next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { cms } from "../../lib/digitalafarin-cms";
import { DigitalAfarinBlockRenderer } from "../../components/digitalafarin-cms/BlockRenderer";

function cmsPath(segments?: string[]) {
  return segments?.length ? `/${segments.join("/")}/` : "/";
}

export const dynamic = "force-dynamic";

async function resolveCmsPage(path: string, previewToken?: string) {
  try {
    return await cms.resolve(path, { previewToken });
  } catch (error) {
    if (previewToken !== undefined || !isCmsNotFoundError(error)) throw error;

    let rule: { match: boolean; type?: number; destination?: string | null } | null = null;
    try {
      rule = await cms.resolveRedirect(path);
    } catch (redirectError) {
      if (!isCmsNotFoundError(redirectError)) throw redirectError;
    }

    if (rule?.match && rule.destination) {
      if (rule.type === 301 || rule.type === 308) permanentRedirect(rule.destination);
      redirect(rule.destination);
    }

    notFound();
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ cms_path?: string[] }>;
  searchParams: Promise<{ cms_preview?: string }>;
}) {
  const path = cmsPath((await params).cms_path);
  try {
    return toNextMetadata(await cms.resolve(path, { previewToken: (await searchParams).cms_preview }));
  } catch (error) {
    if ((await searchParams).cms_preview === undefined && isCmsNotFoundError(error)) return {};
    throw error;
  }
}

export default async function DigitalAfarinCmsPage({
  params,
  searchParams,
}: {
  params: Promise<{ cms_path?: string[] }>;
  searchParams: Promise<{ cms_preview?: string }>;
}) {
  const segments = (await params).cms_path;
  if (["media", "api", "_next", "static"].includes(segments?.[0] || "")) notFound();
  const page = await resolveCmsPage(cmsPath(segments), (await searchParams).cms_preview);

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
