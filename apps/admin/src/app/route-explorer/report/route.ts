import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { BFF_MODE, names, ready } from "@/lib/bff-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

function result(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: responseHeaders });
}

export async function GET(request: NextRequest) {
  if (BFF_MODE && !ready()) return result({ detail: "BFF authentication is not configured" }, 503);
  const authorization = BFF_MODE
    ? "Bearer " + (request.cookies.get(names.access)?.value || "")
    : request.headers.get("authorization") || "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) return result({ detail: "Authentication required" }, 401);

  // Validate CMS identity with Django. Possession of an arbitrary token does not authorize route inspection.
  const upstream = (process.env.DIGITALAFARIN_CMS_API_URL || "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(upstream)) return result({ detail: "CMS API is not configured" }, 503);
  try {
    const validation = await fetch(`${upstream}/sites/?page_size=1`, {
      headers: { authorization, accept: "application/json" },
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(7000),
    });
    if (validation.status === 401 || validation.status === 403) return result({ detail: "Access denied" }, 403);
    if (validation.status !== 200) return result({ detail: "CMS authentication unavailable" }, 503);
    const sites = await validation.json() as { results?: unknown[] };
    if (!Array.isArray(sites.results) || sites.results.length === 0) return result({ detail: "No accessible CMS site" }, 403);
  } catch {
    return result({ detail: "CMS authentication unavailable" }, 503);
  }

  // Export explicitly through CLI. Never launch a filesystem scan from an HTTP request.
  const file = process.env.DIGITALAFARIN_CMS_ROUTE_REPORT_PATH
    ? path.resolve(process.env.DIGITALAFARIN_CMS_ROUTE_REPORT_PATH)
    : path.join(process.cwd(), ".digitalafarin", "routes-report.json");
  try {
    const meta = await fs.stat(file);
    if (!meta.isFile() || meta.size > 1024 * 1024) return result({ detail: "Invalid route report" }, 422);
    const report = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    if (report.version !== 1 || !Array.isArray(report.routes) || !Array.isArray(report.mappings)
      || !Array.isArray(report.errors) || !Array.isArray(report.warnings)) {
      return result({ detail: "Unsupported route report" }, 422);
    }
    return result(report, 200);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return result({ detail: "No route report exported. Run: digitalafarin-cms routes --frontend . --export-report" }, 404);
    }
    return result({ detail: "Unable to read route report" }, 422);
  }
}
