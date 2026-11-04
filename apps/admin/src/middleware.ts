import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_BASE_PATH } from '@/lib/admin-path';
import { isCmsAdminPath, prepareCmsSecurity } from '@/lib/security-headers';

// Keep middleware.ts while Next 15 remains a supported host. Next 16 also
// supports it; embedded scaffolding never copies this into host middleware.
export function middleware(request: NextRequest) {
  const url = new URL(request.url);
  if (!isCmsAdminPath(url.pathname, ADMIN_BASE_PATH) || url.pathname.includes('/_next/')) {
    return NextResponse.next();
  }
  const publicUrl = process.env.DIGITALAFARIN_CMS_PUBLIC_ORIGIN || request.url;
  const context = prepareCmsSecurity(request.headers, {
    development: process.env.NODE_ENV === 'development',
    https: new URL(publicUrl).protocol === 'https:',
    apiUrl: process.env.NEXT_PUBLIC_DIGITALAFARIN_CMS_AUTH_MODE === 'bff'
      ? undefined : process.env.NEXT_PUBLIC_API_URL,
  });
  const response = NextResponse.next({ request: { headers: context.requestHeaders } });
  context.responseHeaders.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
