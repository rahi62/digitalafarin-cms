import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../../apps/admin/bin/scaffold.js', import.meta.url));
function fixture(t, devDependencies = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-host-tooling-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'app')); fs.mkdirSync(path.join(dir, 'stub-bin'));
  const manifest = { private: true, dependencies: { next: '15.5.28', react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'app/page.tsx'), 'export default function Host(){return <main>Host</main>}');
  fs.writeFileSync(path.join(dir, 'stub-bin/npm'), '#!/usr/bin/env node\nrequire("fs").appendFileSync(process.env.CMS_TOOLING_LOG,JSON.stringify(process.argv.slice(2))+"\\n");\n', { mode: 0o755 });
  const log = path.join(dir, 'npm-calls.jsonl');
  return { dir, manifest, log, run: (...args) => spawnSync(process.execPath, [cli, 'embed', '--frontend', dir, ...args], {
    encoding: 'utf8', env: { ...process.env, PATH: path.join(dir, 'stub-bin') + path.delimiter + process.env.PATH, CMS_TOOLING_LOG: log },
  }), calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [] };
}

test('Next 15 missing tooling gets a bounded compatible TypeScript compiler', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t); const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.ok(f.calls()[0].includes('typescript@^5.9.3'), JSON.stringify(f.calls()));
  assert.ok(f.calls()[0].some((s) => s.startsWith('@types/react@')));
  assert.equal(fs.readFileSync(path.join(f.dir, 'app/page.tsx'), 'utf8'), 'export default function Host(){return <main>Host</main>}');
});

test('declared host compiler/types and manifest are preserved', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t, { typescript: '~5.8.3', '@types/react': '^18.3.0' }); const before = fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8');
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.ok(!f.calls().flat().some((s) => s.startsWith('typescript') || s.startsWith('@types/react@')));
  assert.equal(fs.readFileSync(path.join(f.dir, 'package.json'), 'utf8'), before);
});

test('an occupied CMS route aborts before installing dependencies', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t); fs.mkdirSync(path.join(f.dir, 'app/cms')); fs.writeFileSync(path.join(f.dir, 'app/cms/page.tsx'), 'host owned');
  const result = f.run(); assert.notEqual(result.status, 0); assert.deepEqual(f.calls(), []);
  assert.equal(fs.readFileSync(path.join(f.dir, 'app/cms/page.tsx'), 'utf8'), 'host owned');
});

test('skip-install never invokes npm or claims tooling was installed', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t); const result = f.run('--skip-install'); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.calls(), []); assert.doesNotMatch(result.stdout, /tooling ensured/i);
});

test('new host TypeScript config resolves package exports without inventing host aliases', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t); const result = f.run('--skip-install'); assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(f.dir, 'tsconfig.json'), 'utf8'));
  assert.equal(config.compilerOptions.moduleResolution, 'bundler');
  assert.equal(config.compilerOptions.paths, undefined);
});

test('existing host TypeScript config remains byte-for-byte unchanged', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t); const original = '// host JSONC\n{"compilerOptions":{"moduleResolution":"node16","paths":{"@host/*":["./src/*"]}}}\n';
  fs.writeFileSync(path.join(f.dir, 'tsconfig.json'), original);
  const result = f.run('--skip-install'); assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(f.dir, 'tsconfig.json'), 'utf8'), original);
});

test('initial TypeScript config extends existing jsconfig rather than discarding aliases', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t); const original = '{"compilerOptions":{"baseUrl":".","paths":{"@host/*":["./src/*"]}}}\n';
  fs.writeFileSync(path.join(f.dir, 'jsconfig.json'), original);
  const result = f.run('--skip-install'); assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(f.dir, 'tsconfig.json'), 'utf8'));
  assert.equal(config.extends, './jsconfig.json');
  assert.equal(fs.readFileSync(path.join(f.dir, 'jsconfig.json'), 'utf8'), original);
});
