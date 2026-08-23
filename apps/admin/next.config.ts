import type { NextConfig } from "next";

function normalizeBasePath(value: string | undefined) {
  const raw = (value || "/cms").trim();
  if (!raw || raw === "/") return "";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH);

const nextConfig: NextConfig = {
  output: "standalone",
  basePath,
};

export default nextConfig;
