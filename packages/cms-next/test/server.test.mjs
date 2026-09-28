import { test } from 'node:test';
import assert from 'node:assert/strict';

test('media proxy preserves missing media 404, never follows redirects or forwards credentials', async (t) => {
  const { createCmsMediaHandler } = await import('../dist/server.js');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('<html>private debug</html>', { status: 404 });
  });
  const handler = createCmsMediaHandler({ upstream: 'http://storage.internal/uploads/' });
  const result = await handler(new Request('https://host.test/media/cms/missing.png?url=http://evil.test', { headers: { cookie: 'secret', authorization: 'Bearer secret' } }), { params: Promise.resolve({ path: ['cms', 'missing.png'] }) });
  assert.equal(result.status, 404);
  assert.doesNotMatch(await result.text(), /private debug/);
  assert.equal(calls[0].url, 'http://storage.internal/uploads/cms/missing.png');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(new Headers(calls[0].init.headers).get('cookie'), null);
  assert.equal(new Headers(calls[0].init.headers).get('authorization'), null);
});

test('media traversal and upstream redirects fail closed', async (t) => {
  const { createCmsMediaHandler } = await import('../dist/server.js');
  let fetched = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetched++; return new Response('', { status: 302, headers: { Location: 'http://metadata.internal' } }); });
  const handler = createCmsMediaHandler({ upstream: 'https://cdn.test/assets/' });
  for (const segment of ['..', '%2e%2e', 'a/b', 'a\\b', 'https://evil.test']) {
    assert.equal((await handler(new Request('https://host.test/media/x'), { params: Promise.resolve({ path: [segment] }) })).status, 404);
  }
  assert.equal(fetched, 0);
  assert.equal((await handler(new Request('https://host.test/media/x'), { params: Promise.resolve({ path: ['x.png'] }) })).status, 502);
});

test('preview config precedes filesystem and keeps host rewrites excluding preview requests', async () => {
  const { withDigitalAfarinCms } = await import('../dist/config.js');
  const config = withDigitalAfarinCms({ async rewrites() { return [{ source: '/legacy', destination: '/old' }]; } });
  const rules = await config.rewrites();
  assert.ok(rules.beforeFiles.some((r) => r.destination === '/digitalafarin-cms-preview/:cms_path*' && r.has[0].key === 'cms_preview'));
  assert.equal(rules.afterFiles[0].destination, '/old');
  const headers = await config.headers();
  assert.ok(headers.some((r) => r.headers.some((h) => h.key === 'Referrer-Policy' && h.value === 'no-referrer')));
});
