import type { NextRequest } from "next/server";
import { cmsApiBase, cookieAccess, NO_STORE, verifyCmsMutation } from "@/lib/server-session";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  // Never expose refresh/access token obtain, refresh or blacklist responses to browser JS.
  if (path[0] === "auth" && path[1] === "token") {
    return Response.json({ detail: "Use the CMS session endpoints" }, { status: 404, headers: NO_STORE });
  }
  const method = request.method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !verifyCmsMutation(request)) {
    return Response.json({ detail: "Cross-origin request blocked" }, { status: 403, headers: NO_STORE });
  }
  const access = cookieAccess(request);
  if (!access) return Response.json({ detail: "Authentication required" }, { status: 401, headers: NO_STORE });

  const incomingUrl = new URL(request.url);
  const suffix = path.map((segment) => encodeURIComponent(segment)).join("/");
  const target = cmsApiBase() + "/" + (suffix ? suffix + "/" : "") + incomingUrl.search;
  const headers = new Headers({ Authorization: "Bearer " + access });
  for (const name of ["content-type", "accept", "accept-language"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

  const init: RequestInit = { method, headers, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(20_000) };
  if (method !== "GET" && method !== "HEAD") init.body = await request.arrayBuffer();

  try {
    const upstream = await fetch(target, init);
    const responseHeaders = new Headers(NO_STORE);
    responseHeaders.set("Vary", "Cookie");
    for (const name of ["content-type", "content-disposition", "location"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ detail: "CMS API unavailable" }, { status: 503, headers: NO_STORE });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
