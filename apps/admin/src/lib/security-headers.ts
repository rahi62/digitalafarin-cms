/** Explicit options keep embedded hosts in control of their own request pipeline. */
export type CmsSecurityOptions = {
  development: boolean;
  https: boolean;
  apiUrl?: string;
};

function browserApiOrigin(value: string | undefined, development: boolean): string {
  if (!value || /^\/(?![\\/])/.test(value)) return '';
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Invalid CMS browser API URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      !/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])$/i.test(parsed.hostname)) {
    throw new Error('Invalid CMS browser API origin.');
  }
  if (!development && parsed.protocol !== 'https:') {
    throw new Error('CMS browser API must use HTTPS in production.');
  }
  return parsed.origin;
}

export function cmsSecurityHeaders(nonce: string, options: CmsSecurityOptions): Headers {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(nonce)) throw new Error('Invalid CMS security nonce.');
  const apiOrigin = browserApiOrigin(options.apiUrl, options.development);
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ''}`,
    options.development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    // Tiptap positioning, drag/drop and existing React style props require style
    // attributes. This exception cannot authorize scripts or <style> elements.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: https:${options.development ? ' http:' : ''}`,
    "font-src 'self'",
    `connect-src 'self'${apiOrigin ? ' ' + apiOrigin : ''}${options.development ? ' ws: wss:' : ''}`,
    "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    "frame-ancestors 'self'", "frame-src 'none'",
  ];
  if (options.https && !options.development) policy.push('upgrade-insecure-requests');
  const headers = new Headers({
    'Content-Security-Policy': policy.join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cache-Control': 'private, no-store, max-age=0',
  });
  if (options.https && !options.development) headers.set('Strict-Transport-Security', 'max-age=31536000');
  return headers;
}

export function prepareCmsSecurity(incoming: Headers, options: CmsSecurityOptions) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  const responseHeaders = cmsSecurityHeaders(nonce, options);
  const requestHeaders = new Headers(incoming);
  // Incoming values are untrusted; Next must render with our fresh policy/nonce.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', responseHeaders.get('Content-Security-Policy')!);
  return { requestHeaders, responseHeaders };
}

export function isCmsAdminPath(pathname: string, basePath: string): boolean {
  const base = basePath.replace(/\/+$/, '');
  return !base || pathname === base || pathname.startsWith(base + '/');
}
