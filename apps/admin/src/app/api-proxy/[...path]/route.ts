import { BFF_MODE, bffError, failure, names } from "@/lib/bff-session";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function upstreamBaseUrl() {
  return (process.env.DIGITALAFARIN_CMS_API_URL || "http://127.0.0.1:8000/api/cms/v1").replace(/\/+$/, "");
}

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const incomingUrl = new URL(request.url);
  const suffix = path.map((segment) => encodeURIComponent(segment)).join("/");
  // Host Next.js may strip the browser's trailing slash. DRF's CMS routes require it.
  const suffixWithTrailingSlash = suffix ? `${suffix}/` : "";
  const target = `${upstreamBaseUrl()}/${suffixWithTrailingSlash}${incomingUrl.search}`;

  if (BFF_MODE && path[0] === "auth" && path[1] !== "sessions") {
    // Do not permit a BFF-enabled browser to retrieve raw Django tokens.
    return failure(404, "Authentication endpoint not exposed through BFF proxy.");
  }
  if (BFF_MODE) {
    const denied = bffError(request, !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()));
    if (denied) return denied;
    if (!request.cookies.get(names.access)?.value) return failure(401, "Session required");
  }
  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept", "accept-language"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (BFF_MODE) {
    headers.delete("authorization");
    const access = request.cookies.get(names.access)!.value;
    headers.set("authorization", "Bearer " + access);
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
  responseHeaders.set("vary", "Cookie");
  responseHeaders.set("x-content-type-options", "nosniff");

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
