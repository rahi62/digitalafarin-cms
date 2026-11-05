import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cmsSecurityHeaders, prepareCmsSecurity, isCmsAdminPath } from '../src/lib/security-headers.ts';

const nonce = Buffer.alloc(32, 7).toString('base64');
const production = { development: false, https: true };
const directives = value => Object.fromEntries(value.split(';').map(part => {
  const [name, ...values] = part.trim().split(' '); return [name, values.join(' ')];
}));

test('production scripts require nonces and HTTPS responses receive transport and browser headers', () => {
  const headers = cmsSecurityHeaders(nonce, production);
  const policy = directives(headers.get('content-security-policy'));
  assert.match(policy['script-src'], /'strict-dynamic'/);
  assert.ok(policy['script-src'].includes(`'nonce-${nonce}'`));
  assert.ok(!policy['script-src'].includes('unsafe-inline'));
  assert.ok(!policy['script-src'].includes('unsafe-eval'));
  assert.ok(!policy['style-src'].includes('unsafe-inline'));
  assert.equal(policy['style-src-attr'], "'unsafe-inline'");
  assert.equal(policy['object-src'], "'none'");
  assert.equal(policy['frame-ancestors'], "'self'");
  assert.equal(headers.get('strict-transport-security'), 'max-age=31536000');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.match(headers.get('cache-control'), /no-store/);
  assert.equal(cmsSecurityHeaders(nonce, { ...production, https: false }).get('strict-transport-security'), null);
});

test('development-only eval and stylesheet exceptions do not reach production', () => {
  const headers = cmsSecurityHeaders(nonce, { development: true, https: true });
  const policy = directives(headers.get('content-security-policy'));
  assert.match(policy['script-src'], /unsafe-eval/);
  assert.match(policy['style-src'], /unsafe-inline/);
  assert.equal(headers.get('strict-transport-security'), null);
  assert.equal(policy['upgrade-insecure-requests'], undefined);
});

test('API origins are explicit and credential/header injection sources fail closed', () => {
  const headers = cmsSecurityHeaders(nonce, { ...production, apiUrl: 'https://api.example.test/api/cms/v1' });
  assert.equal(directives(headers.get('content-security-policy'))['connect-src'], "'self' https://api.example.test");
  for (const apiUrl of ['//evil.test', '/\\evil.test', 'javascript:alert(1)',
    'https://user:secret@example.test', 'https://host;script-src.test', 'http://api.example.test']) {
    assert.throws(() => cmsSecurityHeaders(nonce, { ...production, apiUrl }));
  }
  assert.throws(() => cmsSecurityHeaders("invalid'; script-src *", production));
});

test('untrusted nonce/policy headers are replaced with fresh per-request values', () => {
  const incoming = new Headers({ 'x-nonce': 'attacker', 'content-security-policy': "script-src * 'unsafe-inline'", accept: 'text/html' });
  const first = prepareCmsSecurity(incoming, production);
  const second = prepareCmsSecurity(incoming, production);
  assert.notEqual(first.requestHeaders.get('x-nonce'), 'attacker');
  assert.notEqual(first.requestHeaders.get('x-nonce'), second.requestHeaders.get('x-nonce'));
  assert.equal(first.requestHeaders.get('content-security-policy'), first.responseHeaders.get('content-security-policy'));
  assert.equal(first.requestHeaders.get('accept'), 'text/html');
});

test('CMS path boundary excludes host routes with similar prefixes', () => {
  assert.equal(isCmsAdminPath('/cms/login', '/cms'), true);
  assert.equal(isCmsAdminPath('/cms', '/cms/'), true);
  assert.equal(isCmsAdminPath('/cms-other', '/cms'), false);
  assert.equal(isCmsAdminPath('/host', '/cms'), false);
  assert.equal(isCmsAdminPath('/login', ''), true);
});
