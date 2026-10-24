# Admin CSP and security headers

The standalone Admin now renders nonce-bearing HTML per request. Its middleware replaces incoming nonce/CSP headers, creates 32 random bytes per response, and forwards the policy to Next.js before rendering. Next applies the nonce to framework scripts; Tiptap receives the document nonce for its required runtime stylesheet. Nonce-bearing Admin HTML is private/no-store and cannot use static export, ISR or shared CDN HTML caching. Public SDK pages retain their own rendering policy.

## Production policy

- Scripts: self + fresh nonce + strict-dynamic. No script unsafe-inline or unsafe-eval.
- Stylesheets/style elements: self or the fresh nonce. Arbitrary unnonced style elements are blocked.
- **Reviewed exception:** style-src-attr permits unsafe-inline for existing React style props, nested taxonomy indentation, Tiptap resizing and Floating UI positioning. This does not authorize scripts or style elements. Removing it requires replacing those dynamic style attributes and rechecking editor behavior.
- Images: self/data/blob/HTTPS for configured media/CDN assets. Fonts: self.
- Connections: self, plus the explicitly configured browser API origin. Absolute production browser API URLs must be HTTPS; credentials, protocol-relative URLs and malformed origins fail closed. BFF upstream server-to-server HTTP URLs are outside this browser policy.
- Objects and child frames: blocked. Frame ancestors: self; X-Frame-Options: SAMEORIGIN.
- Referrer-Policy: no-referrer. X-Content-Type-Options: nosniff.
- Permissions-Policy disables camera, microphone, geolocation, payment and USB.
- HSTS max-age 31536000 only for production HTTPS, without imposing includeSubDomains on host siblings.

Development alone enables React/Next debugging eval, HMR inline stylesheet injection and websocket connections, following the installed Next.js CSP guide. Production browser tests prove those script exceptions are absent.

Set DIGITALAFARIN_CMS_PUBLIC_ORIGIN to the exact public HTTPS origin behind a TLS reverse proxy. HSTS uses that configured origin (or request URL scheme), never a separately trusted arbitrary forwarded header. Test TLS and proxy configuration on staging before rollout.

## Standalone and host integration

Standalone scaffolding includes src/middleware.ts. The middleware convention remains supported in Next 15 and 16; Next 16 warns that it was renamed to proxy. This keeps the existing peer range rather than silently dropping Next 15 middleware support. It applies within the Admin base-path boundary and excludes Next assets.

Embedded scaffolding **does not write host middleware, proxy, root layout or next.config files**. It copies the pure helper at digitalafarin-cms-admin/lib/security-headers.ts and generates a dynamic CMS-only layout. Integration tests compare host middleware/root-layout bytes before and after embedding.

The host developer must compose its existing flow with:

```ts
const context = prepareCmsSecurity(request.headers, {
  development: process.env.NODE_ENV === 'development',
  https: true, // derive from trusted deployment configuration
  apiUrl: undefined, // same-origin BFF; use a reviewed HTTPS origin for direct API
});
```

Only apply this inside the reviewed CMS path boundary (`isCmsAdminPath`). Forward context.requestHeaders through the host's existing NextResponse.next/rewrite handling, preserve its authentication/redirect decisions, and attach context.responseHeaders to the resulting CMS response. Do not replace the host handler with a generic example. Host analytics/scripts/styles and client navigation need a real compatibility review; embedding alone does not attest CSP activation.

## Verification and remaining acceptance

Production browser tests exercise real Next production rendering: unique nonces, nonce-header spoof rejection, framework hydration, HTTP-response inline-script/style injection denial and accepted Tiptap stylesheet rules. Development editor and BFF suites check compatibility. Node tests cover HTTPS headers, origin validation and CMS path boundaries.

Actual HTTPS/reverse-proxy staging, the supported Next version matrix and host-specific CSP composition remain acceptance work. This increment does not complete security auditing, session lifetime policy or the broader product roadmap. No production configuration, release, migration or deployment is applied by this change.
