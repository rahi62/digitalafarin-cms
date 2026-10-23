import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { validCmsEndpoint, fetchCmsUpstream } from '../src/lib/proxy-security.ts';

test('proxy rejects traversal, encoded separators and control characters', () => {
  for (const segment of ['', '.', '..', '%2e%2e', 'auth/token', 'auth\\token', 'bad\u0000key', 'bad\u007fkey']) {
    assert.equal(validCmsEndpoint([segment]), false, segment);
  }
  assert.equal(validCmsEndpoint(['content', 'entries', 'a-b_1']), true);
  assert.equal(validCmsEndpoint(['auth', 'sessions']), true);
});

test('upstream disconnect returns a sanitized, non-cacheable error', async () => {
  const server = createServer((req) => req.socket.destroy());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetchCmsUpstream(`http://127.0.0.1:${server.address().port}`, {});
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { detail: 'CMS API unavailable' });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('upstream redirects are returned without forwarding credentials to a new target', async () => {
  let destinationRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === '/destination') { destinationRequests++; res.end('unexpected'); return; }
    res.writeHead(302, { location: '/destination' }); res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetchCmsUpstream(`http://127.0.0.1:${server.address().port}`, {
      headers: { authorization: 'Bearer test-only' }, redirect: 'follow',
    });
    assert.equal(response.status, 302);
    assert.equal(destinationRequests, 0);
    await response.body?.cancel();
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('unresponsive upstream is bounded and returns a sanitized 503', { timeout: 25000 }, async () => {
  const server = createServer(() => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetchCmsUpstream(`http://127.0.0.1:${server.address().port}`, {});
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { detail: 'CMS API unavailable' });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
