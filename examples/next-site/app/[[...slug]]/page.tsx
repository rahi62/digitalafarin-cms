import { notFound } from "next/navigation";
import { allSchemaJsonLd, jsonLdScriptProps, toNextMetadata } from "@digitalafarin/cms-next";
import { cms } from "../../lib/cms";
import { BlockRenderer } from "../../components/BlockRenderer";

function pathOf(slug?: string[]) {
  return slug?.length ? `/${slug.join("/")}/` : "/";
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ cms_preview?: string }>;
}) {
  try {
    const previewToken = (await searchParams).cms_preview;
    return toNextMetadata(
      await cms.resolve(pathOf((await params).slug), { previewToken }),
    );
  } catch {
    return { title: "Not found" };
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<{ cms_preview?: string }>;
}) {
  const previewToken = (await searchParams).cms_preview;
  let page;
  try {
    page = await cms.resolve(pathOf((await params).slug), { previewToken });
  } catch {
    return notFound();
  }

  return (
    <>
      {page.preview && (
        <div
          style={{
            padding: "10px 16px",
            background: "#fff4e5",
            borderBottom: "1px solid #ffd8a8",
            fontFamily: "sans-serif",
          }}
        >
          DigitalAfarin CMS preview — {page.content.status}
        </div>
      )}
      <BlockRenderer blocks={page.blocks} />
      {allSchemaJsonLd(page).map((schema, index) => (
        <script key={`${String(schema["@type"] || "schema")}-${index}`} {...jsonLdScriptProps(schema)} />
      ))}
    </>
  );
}
