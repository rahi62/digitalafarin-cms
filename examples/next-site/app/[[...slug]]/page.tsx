import { notFound } from "next/navigation";
import { jsonLdScriptProps, toNextMetadata } from "@digitalafarin/cms-next";
import { cms } from "../../lib/cms";
import { BlockRenderer } from "../../components/BlockRenderer";

function pathOf(slug?: string[]) {
  return slug?.length ? `/${slug.join("/")}/` : "/";
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  try {
    return toNextMetadata(await cms.resolve(pathOf((await params).slug)));
  } catch {
    return { title: "Not found" };
  }
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  let page;
  try {
    page = await cms.resolve(pathOf((await params).slug));
  } catch {
    return notFound();
  }

  return (
    <>
      <BlockRenderer blocks={page.blocks} />
      {page.schemas.map((schema) => (
        <script key={schema.id} {...jsonLdScriptProps(schema.data)} />
      ))}
    </>
  );
}
