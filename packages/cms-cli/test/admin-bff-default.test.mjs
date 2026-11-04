import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminCli = fileURLToPath(new URL('../../../apps/admin/bin/scaffold.js', import.meta.url));

function frontend(t, env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-bff-host-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '16.4.5' } }));
  fs.mkdirSync(path.join(dir, 'app'));
  if (env) fs.writeFileSync(path.join(dir, '.env.local'), env);
  return dir;
}
const embed = (dir, ...extra) => spawnSync(process.execPath, [adminCli, 'embed', '--frontend', dir, '--skip-install', ...extra], { encoding: 'utf8' });
const read = (dir) => fs.readFileSync(path.join(dir, '.env.local'), 'utf8');

test('embedding defaults to the httpOnly BFF session with a generated secret', (t) => {
  const dir = frontend(t);
  const result = embed(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const env = read(dir);
  assert.match(env, /^NEXT_PUBLIC_DIGITALAFARIN_CMS_AUTH_MODE=bff$/m);
  assert.match(env, /^DIGITALAFARIN_CMS_BFF_SECRET=[0-9a-f]{64}$/m);
  assert.doesNotMatch(env, /NEXT_PUBLIC_DIGITALAFARIN_CMS_BFF_SECRET/);
  assert.match(result.stdout, /BFF httpOnly session cookies/);
});

test('re-embedding never rotates the secret or overrides a chosen mode', (t) => {
  const dir = frontend(t);
  embed(dir);
  const first = read(dir).match(/^DIGITALAFARIN_CMS_BFF_SECRET=(.*)$/m)[1];
  embed(dir, '--force');
  assert.equal(read(dir).match(/^DIGITALAFARIN_CMS_BFF_SECRET=(.*)$/m)[1], first);
  const custom = frontend(t, 'NEXT_PUBLIC_DIGITALAFARIN_CMS_AUTH_MODE=token\nDIGITALAFARIN_CMS_BFF_SECRET=my-own-secret-that-is-long-enough-123\n');
  embed(custom);
  assert.match(read(custom), /AUTH_MODE=token/);
  assert.match(read(custom), /BFF_SECRET=my-own-secret-that-is-long-enough-123/);
});

test('--legacy-token-auth opts out of the BFF defaults', (t) => {
  const dir = frontend(t);
  const result = embed(dir, '--legacy-token-auth');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(read(dir), /AUTH_MODE|BFF_SECRET/);
  assert.match(result.stdout, /legacy bearer tokens/);
});

test('the generated secret only lands in a git-ignored env file', (t) => {
  const dir = frontend(t);
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
  assert.equal(embed(dir).status, 0);
  const ignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env\.local$/m);
  assert.equal(embed(dir, '--force').status, 0);
  assert.equal(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').match(/^\.env\.local$/gm).length, 1, 'no duplicate entries');
  const covered = frontend(t);
  fs.writeFileSync(path.join(covered, '.gitignore'), '.env*\n');
  embed(covered);
  assert.equal(fs.readFileSync(path.join(covered, '.gitignore'), 'utf8'), '.env*\n');
  const output = embed(frontend(t)).stdout;
  assert.doesNotMatch(output, /[0-9a-f]{64}/, 'secret is never printed');
  const tracked = fs.readdirSync(dir, { recursive: true }).filter((f) => /\.(js|ts|tsx|json|md)$/.test(String(f)) && !String(f).includes('node_modules'));
  for (const file of tracked) {
    const text = fs.readFileSync(path.join(dir, String(file)), 'utf8');
    assert.doesNotMatch(text, /DIGITALAFARIN_CMS_BFF_SECRET=[0-9a-f]{64}/, String(file));
  }
});
