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

async function resolveCmsPage(path: string) {
  try {
    return await cms.resolve(path);
  } catch (error) {
    if (!isCmsNotFoundError(error)) throw error;

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
}: {
  params: Promise<{ cms_path?: string[] }>;
}) {
  const path = cmsPath((await params).cms_path);
  try {
    return toNextMetadata(await cms.resolve(path));
  } catch (error) {
    if (isCmsNotFoundError(error)) return {};
    throw error;
  }
}

export default async function DigitalAfarinCmsPage({
  params,
}: {
  params: Promise<{ cms_path?: string[] }>;
}) {
  const page = await resolveCmsPage(cmsPath((await params).cms_path));

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
