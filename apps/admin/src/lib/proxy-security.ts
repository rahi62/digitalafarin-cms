/** Keep decoded Next.js catch-all segments inside the configured CMS API. */
export function validCmsEndpoint(path: string[]): boolean {
  return path.every(segment => Boolean(segment) && segment !== "." && segment !== ".." &&
    !/[\\/%\x00-\x1f\x7f]/.test(segment));
}

/** Never follow upstream redirects or expose transport exceptions to clients. */
export async function fetchCmsUpstream(target: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(target, {
      ...init, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Response.json({ detail: "CMS API unavailable" }, {
      status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
