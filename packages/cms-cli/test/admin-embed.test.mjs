import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const adminCli = path.join(repoRoot, 'apps/admin/bin/scaffold.js');

test('embedded admin isolates styles and keeps host pages untouched', (t) => {
  const frontend = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-embed-scope-'));
  t.after(() => fs.rmSync(frontend, { recursive: true, force: true }));
  fs.writeFileSync(path.join(frontend, 'package.json'), JSON.stringify({dependencies: {next:'16.0.0'}}));
  fs.mkdirSync(path.join(frontend, 'app'), {recursive:true});
  const page = path.join(frontend, 'app/page.tsx');
  fs.writeFileSync(page, 'export default function Host(){ return <div className="panel">Original host</div> }');
  const done = spawnSync(process.execPath, [adminCli, 'embed', '--frontend', frontend, '--base-path', '/cms', '--skip-install'], {encoding:'utf8'});
  assert.equal(done.status, 0, done.stdout + done.stderr);
  assert.match(fs.readFileSync(page, 'utf8'), /Original host/);
  const css = fs.readFileSync(path.join(frontend, 'digitalafarin-cms-admin/styles/globals.css'), 'utf8');
  const extraCss = fs.readFileSync(path.join(frontend, 'digitalafarin-cms-admin/styles/route-explorer.css'), 'utf8');
  assert.match(css, /^\.digitalafarinCmsAdmin\{/);
  assert.match(css, /@scope \(\.digitalafarinCmsAdmin\)/);
  assert.match(extraCss, /^@scope \(\.digitalafarinCmsAdmin\)/);
  assert.ok(!extraCss.includes('html,body'));
  assert.ok(fs.existsSync(path.join(frontend, 'app/cms/route-explorer/report/route.ts')));
  assert.ok(fs.existsSync(path.join(frontend, 'app/cms/route-explorer/page.tsx')));
  assert.ok(fs.existsSync(path.join(frontend, 'app/cms/content/page.tsx')));
});

test('embedded security helper preserves host middleware and layout byte for byte', (t) => {
  const frontend = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-embed-security-'));
  t.after(() => fs.rmSync(frontend, { recursive: true, force: true }));
  fs.writeFileSync(path.join(frontend, 'package.json'), JSON.stringify({ dependencies: { next: '16.0.0' } }));
  fs.mkdirSync(path.join(frontend, 'app'));
  const middleware = 'export function middleware(){ return hostAuthAndRouting(); }\n';
  const layout = 'export default function Layout({children}){ return <html>{children}</html>; }\n';
  fs.writeFileSync(path.join(frontend, 'middleware.ts'), middleware);
  fs.writeFileSync(path.join(frontend, 'app/layout.tsx'), layout);
  const done = spawnSync(process.execPath, [adminCli, 'embed', '--frontend', frontend, '--skip-install'], { encoding: 'utf8' });
  assert.equal(done.status, 0, done.stdout + done.stderr);
  assert.equal(fs.readFileSync(path.join(frontend, 'middleware.ts'), 'utf8'), middleware);
  assert.equal(fs.readFileSync(path.join(frontend, 'app/layout.tsx'), 'utf8'), layout);
  assert.ok(fs.existsSync(path.join(frontend, 'digitalafarin-cms-admin/lib/security-headers.ts')));
  assert.match(fs.readFileSync(path.join(frontend, 'app/cms/layout.tsx'), 'utf8'), /dynamic = "force-dynamic"/);
});
