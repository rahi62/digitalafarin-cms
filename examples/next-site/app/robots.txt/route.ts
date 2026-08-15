import { cms } from "../../lib/cms";

export async function GET() {
  const response = await fetch(cms.getRobotsUrl(), { next: { revalidate: 300 } });
  if (!response.ok) return new Response("User-agent: *\nDisallow: /\n", { status: 502 });
  return new Response(await response.text(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
