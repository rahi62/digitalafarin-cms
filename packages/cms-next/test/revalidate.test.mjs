import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createCmsRevalidateHandler, createMemoryReplayStore } from '../dist/server.js';
import { createCmsClient } from '../dist/index.js';

const SECRET = 'whsec-sdk-test';
const SITE = 'host.test';
const now = () => Math.floor(Date.now() / 1000);

function event(overrides = {}) {
  return {
    id: crypto.randomUUID(), type: 'content.published', site: SITE, created_at: new Date().toISOString(),
    data: { paths: ['/blog/hello/', '/blog/'] }, ...overrides,
  };
}

function signed(payload, { secret = SECRET, timestamp = now(), idHeader = payload.id, body = JSON.stringify(payload), signatureBody = body } = {}) {
  const signature = 'v1=' + createHmac('sha256', secret).update(`${timestamp}.${signatureBody}`).digest('hex');
  return new Request('https://host.test/api/cms/revalidate', {
    method: 'POST', body,
    headers: {
      'content-type': 'application/json', 'x-digitalafarin-timestamp': String(timestamp),
      'x-digitalafarin-signature': signature, 'x-digitalafarin-event-id': idHeader,
    },
  });
}

function setup(extra = {}) {
  const calls = { paths: [], tags: [] };
  const handler = createCmsRevalidateHandler({
    secret: SECRET, site: SITE, replayStore: createMemoryReplayStore(),
    revalidatePath: (p) => { calls.paths.push(p); },
    revalidateTag: (t) => { calls.tags.push(t); },
    ...extra,
  });
  return { handler, calls };
}

test('a valid signed event revalidates exactly the affected paths and tags', async () => {
  const { handler, calls } = setup();
  const response = await handler(signed(event()));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.paths, ['/blog/hello/', '/blog/']);
  assert.deepEqual(calls.tags.sort(), ['cms:list:host.test', 'cms:path:/blog/', 'cms:path:/blog/hello/']);
});

test('site settings events refresh the whole site tag', async () => {
  const { handler, calls } = setup();
  const response = await handler(signed(event({ type: 'site.settings_changed', data: {} })));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.tags, ['cms:site:host.test']);
});

test('signature mismatch is rejected before any revalidation', async () => {
  const { handler, calls } = setup();
  const payload = event();
  for (const request of [
    signed(payload, { secret: 'wrong-secret' }),
    signed(payload, { signatureBody: JSON.stringify({ ...payload, data: { paths: ['/other/'] } }) }),
    signed(payload, { timestamp: now() - 1 }) && new Request('https://host.test/x', {
      method: 'POST', body: JSON.stringify(payload),
      headers: { 'x-digitalafarin-timestamp': String(now()), 'x-digitalafarin-signature': 'v1=00', 'x-digitalafarin-event-id': payload.id },
    }),
  ]) {
    assert.equal((await handler(request)).status, 401);
  }
  assert.deepEqual(calls, { paths: [], tags: [] });
});

test('stale and future timestamps are rejected; a fresh retry of the same event still works', async () => {
  const { handler, calls } = setup();
  const payload = event();
  assert.equal((await handler(signed(payload, { timestamp: now() - 3600 }))).status, 401);
  assert.equal((await handler(signed(payload, { timestamp: now() + 3600 }))).status, 401);
  assert.equal(calls.paths.length, 0);
  assert.equal((await handler(signed(payload))).status, 200);
});

test('replayed event ids are rejected even with a fresh valid signature', async () => {
  const { handler, calls } = setup();
  const payload = event();
  assert.equal((await handler(signed(payload))).status, 200);
  assert.equal((await handler(signed(payload))).status, 409);
  assert.equal(calls.paths.length, 2); // only the first delivery revalidated
});

test('unsigned requests cannot consume a replay slot', async () => {
  const { handler } = setup();
  const payload = event();
  assert.equal((await handler(signed(payload, { secret: 'attacker' }))).status, 401);
  assert.equal((await handler(signed(payload))).status, 200);
});

test('a failed revalidation releases the replay slot so the CMS retry can succeed', async () => {
  let fail = true;
  const { handler } = setup({ revalidateTag: () => { if (fail) throw new Error('boom'); } });
  const payload = event();
  assert.equal((await handler(signed(payload))).status, 500);
  fail = false;
  assert.equal((await handler(signed(payload))).status, 200);
});

test('wrong site, mismatched event id, bad paths, unknown types and oversize bodies are rejected', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(signed(event({ site: 'other.test' })))).status, 400);
  const payload = event();
  assert.equal((await handler(signed(payload, { idHeader: crypto.randomUUID() }))).status, 400);
  for (const paths of [['//evil.test/'], ['no-slash'], ['/a/../b/'], ['/a?x=1'], ['/a\\b/'], Array(51).fill('/x/')]) {
    assert.equal((await handler(signed(event({ data: { paths } })))).status, 400, JSON.stringify(paths).slice(0, 40));
  }
  assert.equal((await handler(signed(event({ type: 'content.exploded' })))).status, 400);
  const big = event({ data: { paths: [], pad: 'x'.repeat(70 * 1024) } });
  assert.equal((await handler(signed(big))).status, 413);
  assert.deepEqual(calls, { paths: [], tags: [] });
});

test('misconfiguration and wrong methods fail closed', async () => {
  const unconfigured = createCmsRevalidateHandler({ secret: '', site: SITE });
  const saved = process.env.DIGITALAFARIN_CMS_WEBHOOK_SECRET;
  delete process.env.DIGITALAFARIN_CMS_WEBHOOK_SECRET;
  try { assert.equal((await unconfigured(signed(event()))).status, 503); }
  finally { if (saved !== undefined) process.env.DIGITALAFARIN_CMS_WEBHOOK_SECRET = saved; }
  const { handler } = setup();
  assert.equal((await handler(new Request('https://host.test/x', { method: 'GET' }))).status, 405);
});

test('SDK fetches carry precise cache tags and respect the caching mode', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/resolve/')) return Response.json({ site: { name: 'H', domain: SITE }, content: {}, blocks: [] });
    return Response.json({});
  });
  const tagged = createCmsClient({ baseUrl: 'https://api.test', site: SITE, revalidate: false });
  await tagged.resolve('/blog/a');
  const resolveCall = calls.find((c) => c.url.includes('/resolve/'));
  assert.equal(resolveCall.init.cache, 'force-cache');
  assert.equal(resolveCall.init.next.revalidate, false);
  assert.deepEqual(resolveCall.init.next.tags.sort(), ['cms:path:/blog/a/', 'cms:site:host.test']);
  const contextCall = calls.find((c) => c.url.includes('/site-context/'));
  assert.deepEqual(contextCall.init.next.tags, ['cms:site:host.test']);

  calls.length = 0;
  await tagged.listEntries({ page: 1 });
  await tagged.getMenu('main');
  for (const call of calls) assert.deepEqual(call.init.next.tags.sort(), ['cms:list:host.test', 'cms:site:host.test']);

  calls.length = 0;
  await createCmsClient({ baseUrl: 'https://api.test', site: SITE, revalidate: 60 }).listEntries();
  assert.equal(calls[0].init.next.revalidate, 60);
  assert.ok(calls[0].init.next.tags.includes('cms:list:host.test'));

  calls.length = 0;
  await createCmsClient({ baseUrl: 'https://api.test', site: SITE }).listEntries();
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.next, undefined);
});
