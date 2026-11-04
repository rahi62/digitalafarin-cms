import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
test('installation inventories existing home/blog/detail and preserves custom sources', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-host-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0' } }));
  for (const route of ['app/page.tsx', 'app/blog/page.tsx', 'app/blog/[slug]/page.tsx']) {
    fs.mkdirSync(path.dirname(path.join(dir, route)), { recursive: true });
    fs.writeFileSync(path.join(dir, route), 'export default function Host() { return "legacy"; }');
  }
  const result = spawnSync(process.execPath, [cli, 'init', '--frontend', dir, '--skip-install', '--with-public-route', '--with-collection', '--content-type', 'news'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const route of ['app/page.tsx', 'app/blog/page.tsx', 'app/blog/[slug]/page.tsx']) {
    assert.equal(fs.readFileSync(path.join(dir, route), 'utf8'), 'export default function Host() { return "legacy"; }');
  }
  assert.ok(fs.existsSync(path.join(dir, 'app/media/[...path]/route.ts')));
  assert.ok(fs.existsSync(path.join(dir, 'app/digitalafarin-cms-preview/[[...cms_path]]/page.tsx')));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.digitalafarin/integration.json'), 'utf8'));
  assert.equal(manifest.status, 'review-required');
  assert.ok(manifest.routes.some((r) => r.url === '/blog/[slug]'));
  assert.match(fs.readFileSync(path.join(dir, '.digitalafarin/proposals/app/blog/page.tsx.txt'), 'utf8'), /listEntries/);
  const detailProposal = fs.readFileSync(path.join(dir, '.digitalafarin/proposals/app/blog/[slug]/page.tsx.txt'), 'utf8');
  assert.match(detailProposal, /decodeURIComponent/);
  assert.doesNotMatch(detailProposal, /encodeURIComponent\(slug\)/);
  assert.doesNotMatch(result.stdout, /wiring complete/);
  const doctor = spawnSync(process.execPath, [cli, 'doctor', '--frontend', dir], { cwd: dir, encoding: 'utf8' });
  assert.equal(doctor.status, 1);
  assert.match(doctor.stdout, /review|required|pending/i);
});

test('JavaScript host routes receive JavaScript adapters and changes after review are rejected', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-js-host-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0' } }));
  fs.mkdirSync(path.join(dir, 'app/blog/[slug]'), { recursive: true });
  for (const file of ['app/blog/page.jsx', 'app/blog/[slug]/page.jsx']) fs.writeFileSync(path.join(dir, file), 'export default function Host() { return "old"; }');
  const args = ['--frontend', dir, '--skip-install', '--with-collection'];
  assert.equal(spawnSync(process.execPath, [cli, 'init', ...args], { cwd: dir }).status, 0);
  for (const file of ['app/blog/page.jsx', 'app/blog/[slug]/page.jsx']) {
    const proposal = fs.readFileSync(path.join(dir, '.digitalafarin/proposals', file + '.txt'), 'utf8');
    assert.doesNotMatch(proposal, /type Props|props: Props|Promise<|as any|page: number/);
  }
  fs.appendFileSync(path.join(dir, 'app/blog/page.jsx'), '\n// edited after review');
  const result = spawnSync(process.execPath, [cli, 'apply-integration', '--frontend', dir], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /changed since review/);
  assert.match(fs.readFileSync(path.join(dir, 'app/blog/page.jsx'), 'utf8'), /edited after review/);
});

test('init scaffolds CMS sitemap and robots routes unless the host already owns those URLs', (t) => {
  const make = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-seo-host-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0' } }));
    for (const [file, text] of Object.entries({ 'app/page.tsx': 'export default function Home() {}', ...files })) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    }
    const result = spawnSync(process.execPath, [cli, 'init', '--frontend', dir, '--skip-install'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return dir;
  };
  const fresh = make({});
  assert.match(fs.readFileSync(path.join(fresh, 'app/sitemap.xml/route.ts'), 'utf8'), /createCmsSitemapHandler/);
  assert.match(fs.readFileSync(path.join(fresh, 'app/sitemaps/[page]/route.ts'), 'utf8'), /createCmsSitemapPageHandler/);
  assert.match(fs.readFileSync(path.join(fresh, 'app/robots.txt/route.ts'), 'utf8'), /createCmsRobotsHandler/);

  const owned = make({ 'app/sitemap.ts': 'export default () => []', 'public/robots.txt': 'User-agent: *' });
  assert.ok(!fs.existsSync(path.join(owned, 'app/sitemap.xml/route.ts')));
  assert.ok(!fs.existsSync(path.join(owned, 'app/robots.txt/route.ts')));
  assert.equal(fs.readFileSync(path.join(owned, 'public/robots.txt'), 'utf8'), 'User-agent: *');
  const manifest = JSON.parse(fs.readFileSync(path.join(owned, '.digitalafarin/integration.json'), 'utf8'));
  assert.ok(manifest.warnings.some((w) => /sitemap\.xml \(app\/sitemap\.ts\)/.test(w)));
  assert.ok(manifest.warnings.some((w) => /robots\.txt \(public\/robots\.txt\)/.test(w)));
});

test('--with-revalidate scaffolds the signed revalidation route, a secret and a tag-cached adapter', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-reval-host-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0' } }));
  fs.mkdirSync(path.join(dir, 'app'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'app/page.tsx'), 'export default function Home() {}');
  const plain = spawnSync(process.execPath, [cli, 'init', '--frontend', dir, '--skip-install'], { cwd: dir, encoding: 'utf8' });
  assert.equal(plain.status, 0, plain.stderr);
  assert.ok(!fs.existsSync(path.join(dir, 'app/api/cms/revalidate/route.ts')), 'route is opt-in');
  assert.doesNotMatch(fs.readFileSync(path.join(dir, '.env.local'), 'utf8'), /WEBHOOK_SECRET/);

  fs.rmSync(path.join(dir, '.digitalafarin'), { recursive: true });
  fs.rmSync(path.join(dir, 'lib'), { recursive: true });
  const result = spawnSync(process.execPath, [cli, 'init', '--frontend', dir, '--skip-install', '--with-revalidate'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const route = fs.readFileSync(path.join(dir, 'app/api/cms/revalidate/route.ts'), 'utf8');
  assert.match(route, /createCmsRevalidateHandler/);
  assert.match(route, /export const POST/);
  assert.match(fs.readFileSync(path.join(dir, '.env.local'), 'utf8'), /^DIGITALAFARIN_CMS_WEBHOOK_SECRET=[0-9a-f]{64}$/m);
  assert.match(fs.readFileSync(path.join(dir, 'lib/digitalafarin-cms.ts'), 'utf8'), /revalidate: false/);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.digitalafarin/integration.json'), 'utf8'));
  assert.ok(manifest.warnings.some((w) => /cms_drain_webhooks/.test(w)));
});
