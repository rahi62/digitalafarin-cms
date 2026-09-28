import { CmsRequestError, toNextMetadata } from "@digitalafarin/cms-next";
import { cms } from "../../../lib/digitalafarin-cms";
import { DigitalAfarinBlockRenderer } from "../../../components/digitalafarin-cms/BlockRenderer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type Props = { params: Promise<{ cms_path?: string[] }>; searchParams: Promise<{ cms_preview?: string | string[] }> };
async function preview(props: Props) {
  const params = await props.params;
  const query = await props.searchParams;
  const token = typeof query.cms_preview === "string" ? query.cms_preview : "";
  const path = params.cms_path?.length ? `/${params.cms_path.join("/")}/` : "/";
  return cms.resolve(path, { previewToken: token });
}
export async function generateMetadata(props: Props) {
  try { return toNextMetadata(await preview(props)); }
  catch { return { title: "Preview unavailable", robots: { index: false, follow: false }, referrer: "no-referrer" as const }; }
}
export default async function CmsPreview(props: Props) {
  try {
    const page = await preview(props);
    return <main><p role="status">CMS preview — unpublished changes</p><h1>{page.content.title}</h1><DigitalAfarinBlockRenderer blocks={page.blocks} /></main>;
  } catch (error) {
    if (!(error instanceof CmsRequestError)) throw error;
    return <main><h1>Preview unavailable</h1><p role="alert">This preview link is invalid, expired or no longer matches the content. Create a new preview link in the CMS.</p></main>;
  }
}
