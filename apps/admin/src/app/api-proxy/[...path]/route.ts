import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function upstreamBaseUrl() {
  return (process.env.DIGITALAFARIN_CMS_API_URL || "http://127.0.0.1:8000/api/cms/v1").replace(/\/+$/, "");
}

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const incomingUrl = new URL(request.url);
  const suffix = path.map((segment) => encodeURIComponent(segment)).join("/");
  const target = `${upstreamBaseUrl()}/${suffix}${incomingUrl.search}`;

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept", "accept-language"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "location", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
