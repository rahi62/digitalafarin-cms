const rawBasePath = process.env.NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH || "/cms";

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export const ADMIN_BASE_PATH = normalizeBasePath(rawBasePath);

export function adminPath(pathname = "/") {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!ADMIN_BASE_PATH) return normalizedPath;
  if (normalizedPath === "/") return `${ADMIN_BASE_PATH}/`;
  return `${ADMIN_BASE_PATH}${normalizedPath}`;
}

export function stripAdminBasePath(pathname: string) {
  if (!ADMIN_BASE_PATH) return pathname || "/";
  if (pathname === ADMIN_BASE_PATH || pathname === `${ADMIN_BASE_PATH}/`) return "/";
  if (pathname.startsWith(`${ADMIN_BASE_PATH}/`)) {
    const stripped = pathname.slice(ADMIN_BASE_PATH.length);
    return stripped || "/";
  }
  return pathname || "/";
}
