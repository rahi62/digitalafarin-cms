import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { usesCacheComponents, segmentConfig } from '../bin/next-mode.js';

const cli = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const adminApp = fileURLToPath(new URL('../../../apps/admin/src/app', import.meta.url));

function host(t, nextConfig) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-segment-host-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16.4.5' } }));
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'app/page.tsx'), 'export default function Home() { return null; }');
  if (nextConfig) fs.writeFileSync(path.join(dir, 'next.config.ts'), nextConfig);
  return dir;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const SEGMENT = /^export const (dynamic|runtime|revalidate|fetchCache)\s*=/m;

test('cacheComponents detection reads the host config and ignores comments', (t) => {
  assert.equal(usesCacheComponents(host(t, 'export default { cacheComponents: true };')), true);
  assert.equal(usesCacheComponents(host(t, 'const c = {\n  cacheComponents: true,\n};\nexport default c;')), true);
  assert.equal(usesCacheComponents(host(t, '// cacheComponents: true\nexport default {};')), false);
  assert.equal(usesCacheComponents(host(t, 'export default { cacheComponents: false };')), false);
  assert.equal(usesCacheComponents(host(t)), false);
  assert.equal(segmentConfig(host(t, 'export default { cacheComponents: true };')), 'export const instant = false;');
  assert.equal(segmentConfig(host(t)), 'export const dynamic = "force-dynamic";');
});

test('a cacheComponents host never receives rejected route segment config', (t) => {
  const dir = host(t, 'export default {\n  cacheComponents: true,\n  partialPrefetching: true,\n};\n');
  const result = spawnSync(process.execPath, [
    cli, 'init', '--frontend', dir, '--skip-install', '--with-public-route', '--with-collection', '--with-revalidate',
  ], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const generated = walk(path.join(dir, 'app')).filter((file) => file !== path.join(dir, 'app/page.tsx'));
  assert.ok(generated.length >= 6);
  for (const file of generated) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), SEGMENT, path.relative(dir, file));
  }
  assert.match(fs.readFileSync(path.join(dir, 'app/digitalafarin-cms-preview/[[...cms_path]]/page.tsx'), 'utf8'), /^export const instant = false;$/m);
  const catchAll = fs.readFileSync(path.join(dir, 'app/[...cms_path]/page.tsx'), 'utf8');
  assert.match(catchAll, /resolveCmsPageCached/);
  assert.doesNotMatch(catchAll, /searchParams/);
  assert.doesNotMatch(catchAll, /force-dynamic/);
});

test('a classic host keeps per-request rendering for CMS pages but handlers carry no segment config', (t) => {
  const dir = host(t);
  const result = spawnSync(process.execPath, [cli, 'init', '--frontend', dir, '--skip-install', '--with-public-route'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(fs.readFileSync(path.join(dir, 'app/[...cms_path]/page.tsx'), 'utf8'), /^export const dynamic = "force-dynamic";$/m);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'app/[...cms_path]/page.tsx'), 'utf8'), /instant/);
  for (const handler of ['app/media/[...path]/route.ts', 'app/sitemap.xml/route.ts', 'app/robots.txt/route.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, handler), 'utf8'), SEGMENT, handler);
  }
});

test('admin route handlers carry no segment config that cacheComponents hosts would reject', () => {
  const handlers = walk(adminApp).filter((file) => /route\.ts$/.test(file));
  assert.ok(handlers.length >= 5);
  for (const file of handlers) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), SEGMENT, path.relative(adminApp, file));
  }
});
