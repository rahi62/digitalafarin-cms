import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCmsClient, toNextMetadata } from '../dist/index.js';

test('public collection uses a site-bound anonymous typed endpoint and no-store', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: new URL(url), init });
    return Response.json({ count: 1, page: 1, results: [{ path: '/blog/one/' }] });
  });
  const client = createCmsClient({ baseUrl: 'https://api.test/api/cms/v1', site: 'host.test' });
  assert.equal(typeof client.listEntries, 'function');
  const result = await client.listEntries({ content_type: 'news', page: 2, search: 'فارسی', site: 'other.test' });
  assert.equal(result.count, 1);
  assert.equal(calls[0].url.pathname, '/api/cms/v1/content/public-entries/');
  assert.equal(calls[0].url.searchParams.get('site'), 'host.test');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('HTML errors never appear in SDK error message, body or serialization', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>SECRET_KEY database-password</html>', { status: 500 }));
  const client = createCmsClient({ baseUrl: 'https://api.test', site: 'host.test' });
  await assert.rejects(client.resolve('/blog/a/'), (error) => {
    assert.equal(error.status, 500);
    assert.doesNotMatch(error.message + error.body + JSON.stringify(error), /SECRET_KEY|database-password|<html>/);
    return true;
  });
});

test('preview including empty tokens bypasses all caching and never uses public fallback', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).includes('/resolve/') ? new Response('', { status: 403 }) : Response.json({});
  });
  const client = createCmsClient({ baseUrl: 'https://api.test', site: 'host.test', revalidate: 60 });
  assert.equal(typeof client.resolveForRoute, 'function');
  await assert.rejects(client.resolveForRoute('/', { previewToken: '' }), /preview/i);
  assert.ok(calls.find((x) => x.url.includes('preview=')));
  assert.ok(calls.every((x) => x.init.cache === 'no-store' && !x.init.next));
});

test('only ordinary public 404 permits host fallback', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => String(url).includes('/resolve/') ? new Response('', { status: 404 }) : Response.json({}));
  const client = createCmsClient({ baseUrl: 'https://api.test', site: 'host.test' });
  assert.equal(typeof client.resolveForRoute, 'function');
  assert.equal(await client.resolveForRoute('/old/'), null);
  await assert.rejects(client.resolveForRoute('/old/', { previewToken: 'signed' }));
});

test('canonical follows entry URL and preview is noindex/no-referrer', () => {
  const page = { site: { name: 'Host', domain: 'host.test' }, content: { title: 'A', excerpt: '', path: '/blog/a/', url: 'https://host.test/blog/a/' }, seo: null };
  assert.equal(toNextMetadata(page).alternates.canonical, page.content.url);
  const preview = toNextMetadata({ ...page, preview: true });
  assert.equal(preview.robots.index, false);
  assert.equal(preview.referrer, 'no-referrer');
});

test('an error on a cloned fetch body does not hang public fallback', async (t) => {
  const source = new Response('missing');
  const clone = source.clone(); // cancellation waits for the other tee branch
  t.mock.method(globalThis, 'fetch', async (url) => String(url).includes('/resolve/') ? new Response(clone.body, { status: 404 }) : Response.json({}));
  const client = createCmsClient({ baseUrl: 'https://api.test', site: 'host.test' });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('fallback hung on response cancellation')), 300));
  try { assert.equal(await Promise.race([client.resolveForRoute('/legacy/'), timeout]), null); }
  finally { await source.text(); }
});

test('revalidate zero does not send conflicting Next cache options', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.cache, 'no-store');
    assert.equal(init.next, undefined);
    return Response.json({});
  });
  await createCmsClient({ baseUrl: 'https://api.test', site: 'host.test', revalidate: 0 }).listEntries();
});

test('network errors do not disclose internal URLs and never fall back', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('http://internal-secret-host:8000 unreachable'); });
  await assert.rejects(createCmsClient({ baseUrl: 'https://api.test', site: 'host.test' }).resolveForRoute('/legacy/'), (error) => {
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /internal-secret-host/);
    return true;
  });
});
