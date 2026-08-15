import { notFound } from "next/navigation";
import { jsonLdScriptProps, toNextMetadata } from "@digitalafarin/cms-next";
import { cms } from "../../lib/cms";
import { BlockRenderer } from "../../components/BlockRenderer";

function pathOf(slug?: string[]) {
  return slug?.length ? `/${slug.join("/")}/` : "/";
}

function previewToken(searchParams: Record<string, string | string[] | undefined>) {
  const value = searchParams.cms_preview;
  return Array.isArray(value) ? value[0] : value;
}

type Props = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props) {
  try {
    const token = previewToken(await searchParams);
    const page = await cms.resolve(pathOf((await params).slug), { previewToken: token });
    const metadata = toNextMetadata(page);
    return token ? { ...metadata, robots: { index: false, follow: false } } : metadata;
  } catch {
    return { title: "Not found" };
  }
}

export default async function Page({ params, searchParams }: Props) {
  let page;
  const token = previewToken(await searchParams);
  try {
    page = await cms.resolve(pathOf((await params).slug), { previewToken: token });
  } catch {
    return notFound();
  }

  return (
    <>
      {page.preview && (
        <div style={{ padding: "8px 14px", background: "#fffaeb", borderBottom: "1px solid #fedf89", fontSize: 12 }}>
          DigitalAfarin CMS Preview — این نسخه عمومی نیست.
        </div>
      )}
      <BlockRenderer blocks={page.blocks} />
      {page.schemas.map((schema) => (
        <script key={schema.id} {...jsonLdScriptProps(schema.data)} />
      ))}
    </>
  );
}
