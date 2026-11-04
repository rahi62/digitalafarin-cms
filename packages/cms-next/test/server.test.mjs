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

test('sitemap/robots handlers proxy a fixed upstream, tag fetches and never leak upstream errors', async (t) => {
  const { createCmsSitemapHandler, createCmsSitemapPageHandler, createCmsRobotsHandler } = await import('../dist/server.js');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('page=9')) return new Response('<html>debug</html>', { status: 404 });
    if (String(url).includes('/robots/')) return new Response('User-agent: *\nDisallow: /cms/\n', { status: 200, headers: { etag: 'W/"r"', 'cache-control': 'public, max-age=0, s-maxage=60' } });
    return new Response('<urlset></urlset>', { status: 200 });
  });
  const options = { baseUrl: 'https://cms.test/api/cms/v1', site: 'example.test' };
  const sitemap = await createCmsSitemapHandler(options)();
  assert.equal(sitemap.status, 200);
  assert.equal(sitemap.headers.get('content-type'), 'application/xml; charset=utf-8');
  assert.equal(calls[0].url, 'https://cms.test/api/cms/v1/content/sitemap/?site=example.test');
  assert.deepEqual(calls[0].init.next.tags, ['cms:site:example.test']);
  assert.equal(calls[0].init.redirect, 'manual');

  const page = createCmsSitemapPageHandler(options);
  assert.equal((await page(new Request('https://h.test/x'), { params: Promise.resolve({ page: '2.xml' }) })).status, 200);
  assert.match(calls[1].url, /sitemap\/\?site=example\.test&page=2$/);
  for (const bad of ['0.xml', 'abc', '1.xml.evil', '../x', '']) {
    assert.equal((await page(new Request('https://h.test/x'), { params: Promise.resolve({ page: bad }) })).status, 404);
  }
  const missing = await page(new Request('https://h.test/x'), { params: Promise.resolve({ page: '9.xml' }) });
  assert.equal(missing.status, 404);
  assert.doesNotMatch(await missing.text(), /debug/);

  const robots = await createCmsRobotsHandler(options)();
  assert.equal(robots.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(robots.headers.get('etag'), 'W/"r"');
  assert.match(await robots.text(), /Disallow: \/cms\//);
});

test('sitemap handler reports misconfiguration and upstream failure without throwing', async (t) => {
  const { createCmsSitemapHandler } = await import('../dist/server.js');
  const saved = { ...process.env };
  delete process.env.DIGITALAFARIN_CMS_URL; delete process.env.DIGITALAFARIN_CMS_SITE;
  t.after(() => Object.assign(process.env, saved));
  assert.equal((await createCmsSitemapHandler()()).status, 503);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('ECONNREFUSED'); });
  assert.equal((await createCmsSitemapHandler({ baseUrl: 'https://cms.test/api', site: 's.test' })()).status, 502);
});

test('cache tag helpers normalise paths like the CMS', async () => {
  const { cmsSiteTag, cmsPathTag } = await import('../dist/index.js');
  assert.equal(cmsSiteTag('a.test'), 'cms:site:a.test');
  assert.equal(cmsPathTag('blog//post'), 'cms:path:/blog/post/');
  assert.equal(cmsPathTag('/'), 'cms:path:/');
});
