import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { inventory, mapRoute, readRouteMap, validateRoutes } from '../bin/routes.js';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'route-map-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return root;
}

test('inventories App Router paths, route groups, parallel routes, dynamic segments and CMS loaders', (t) => {
  const root = fixture(t, {
    'src/app/page.tsx': 'export default function Home() {}',
    'src/app/(marketing)/blog/page.tsx': 'cms.listEntries({content_type:"post"})',
    'src/app/(marketing)/blog/[slug]/page.tsx': 'cms.resolveForRoute("/blog/x/")',
    'src/app/@modal/(.)photo/page.tsx': '',
    'src/app/api/items/route.ts': '',
    'src/app/[...cms_path]/page.tsx': '',
    'src/app/_hidden/page.tsx': '',
  });
  const result = inventory(root, path.join(root, 'src'));
  assert.ok(result.some((r) => r.url === '/blog/[slug]' && r.groups.includes('(marketing)') && r.loader === 'cms-detail'));
  assert.ok(result.some((r) => r.url === '/blog' && r.loader === 'cms-collection'));
  assert.ok(result.some((r) => r.url === '/api/items' && r.reserved && r.kind === 'route'));
  assert.ok(result.some((r) => r.parallel && r.intercepted));
  assert.ok(result.some((r) => r.url === '/[...cms_path]' && r.route_kind === 'catch-all'));
  assert.ok(!result.some((r) => r.file.includes('_hidden')));
});

test('mapping never changes host pages, rejects protected or ambiguous routes', (t) => {
  const files = {
    'app/blog/page.tsx': 'cms.listEntries()',
    'app/blog/[slug]/page.tsx': 'cms.resolveForRoute()',
    'app/api/route.ts': '',
  };
  const root = fixture(t, files);
  const mapping = mapRoute(root, root, { route: '/blog/[slug]', mode: 'detail', contentType: 'post' });
  assert.equal(mapping.content_type, 'post');
  assert.equal(fs.readFileSync(path.join(root, 'app/blog/[slug]/page.tsx'), 'utf8'), files['app/blog/[slug]/page.tsx']);
  assert.equal(readRouteMap(root).mappings.length, 1);
  assert.deepEqual(validateRoutes(root, root).errors, []);
  assert.deepEqual(validateRoutes(root, root).warnings, []);
  assert.throws(() => mapRoute(root, root, { route: '/api', mode: 'page', contentType: 'post' }), /one ordinary page/);
  assert.throws(() => mapRoute(root, root, { route: '/blog', mode: 'detail', contentType: 'post' }), /dynamic/);
  mapRoute(root, root, { route: '/blog', mode: 'collection', contentType: 'post' });
  assert.equal(readRouteMap(root).mappings.length, 2);
});

test('validation identifies stale mappings, unintegrated loaders and route collisions', (t) => {
  const root = fixture(t, {
    'app/(one)/blog/[slug]/page.tsx': 'host loader',
    'app/(two)/blog/[id]/page.tsx': 'host loader',
    'app/services/[id]/page.tsx': 'host loader',
  });
  const report = validateRoutes(root, root);
  assert.ok(report.errors.some((s) => s.includes('Ambiguous route ownership')));
  mapRoute(root, root, { route: '/services/[id]', mode: 'detail', contentType: 'service' });
  assert.ok(validateRoutes(root, root).warnings.some((s) => s.includes('not statically verified')));
  fs.renameSync(path.join(root, 'app/services/[id]/page.tsx'), path.join(root, 'app/services/[id]/page.jsx'));
  assert.ok(validateRoutes(root, root).errors.some((s) => s.includes('Stale route mapping')));
});

test('requiring a map reports missing configuration without modifying the host', (t) => {
  const root = fixture(t, { 'app/page.tsx': 'host home' });
  assert.ok(validateRoutes(root, root, { requireMap: true }).errors.some((s) => s.includes('missing')));
  assert.ok(!fs.existsSync(path.join(root, '.digitalafarin')));
});

test('CLI commands expose read-only inventory and enforce explicit mapping', (t) => {
  const root = fixture(t, {
    'package.json': JSON.stringify({ dependencies: { next: '16.0.0' } }),
    'app/page.tsx': 'export default function Home() {}',
    'app/blog/page.tsx': 'cms.listEntries()',
  });
  const cli = new URL('../bin/cli.js', import.meta.url).pathname;
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args, '--frontend', root], { encoding: 'utf8', cwd: root });
    return result;
  };
  const before = run('routes');
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /"url": "\/blog"/);
  assert.ok(!fs.existsSync(path.join(root, '.digitalafarin')));
  const unmapped = run('validate-routes');
  assert.equal(unmapped.status, 1);
  assert.match(unmapped.stdout, /Route mapping is missing/);
  const mapped = run('map-route', '--route', '/blog', '--mode', 'collection', '--content-type', 'post');
  assert.equal(mapped.status, 0, mapped.stderr);
  const verified = run('validate-routes');
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  assert.match(verified.stdout, /"errors": \[\]/);
});
