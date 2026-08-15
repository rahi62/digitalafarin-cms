import { cms } from "../../lib/cms";

export async function GET() {
  const response = await fetch(cms.getSitemapUrl(), { next: { revalidate: 300 } });
  if (!response.ok) return new Response("Sitemap unavailable", { status: 502 });
  return new Response(await response.text(), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
