import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = path.join(root, '.tmp/host-integration');
fs.mkdirSync(fixture, { recursive: true });
function write(file, text) {
  fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true });
  fs.writeFileSync(path.join(fixture, file), text);
}
function run(file, args) {
  const result = spawnSync(process.execPath, [path.join(root, file), ...args], { cwd: fixture, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
// Create a fresh fixture per invocation without touching any consumer project.
const fixtureDir = fs.mkdtempSync(path.join(fixture, 'run-'));
const files = {
  'package.json': JSON.stringify({ name: 'cms-host-fixture', private: true, type: 'module', dependencies: { next: '*', react: '*', 'react-dom': '*', '@digitalafarin/cms-next': '*' } }),
  'app/layout.tsx': 'export default function Layout({children}:{children:React.ReactNode}) { return <html><body>{children}</body></html>; }',
  'app/page.tsx': 'export default function Home() { return <h1>Original host homepage</h1>; }',
  'app/blog/page.tsx': 'export default function Blog() { return <h1>Original legacy collection</h1>; }',
  'app/blog/[slug]/page.tsx': 'import { notFound } from "next/navigation"; export default async function Legacy({params}:{params:Promise<{slug:string}>}) { if ((await params).slug !== "legacy") notFound(); return <h1>Original legacy article</h1>; }',
  '.env.local': 'DIGITALAFARIN_CMS_URL=http://127.0.0.1:8197/api/cms/v1\nDIGITALAFARIN_CMS_SITE=127.0.0.1:3197\nDIGITALAFARIN_CMS_MEDIA_UPSTREAM=http://127.0.0.1:8197/media/\nDIGITALAFARIN_CMS_API_URL=http://127.0.0.1:8197/api/cms/v1\n',
};
for (const [file, text] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(fixtureDir, file)), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, file), text);
}
run('packages/cms-cli/bin/cli.js', ['init', '--frontend', fixtureDir, '--skip-install', '--with-public-route', '--with-collection', '--content-type', 'news']);
run('packages/cms-cli/bin/cli.js', ['apply-integration', '--frontend', fixtureDir]);
run('apps/admin/bin/scaffold.js', ['embed', '--frontend', fixtureDir, '--api-url', 'http://127.0.0.1:8197/api/cms/v1', '--skip-install']);
write('active-path.txt', fixtureDir);
console.log('Fixture ready:', fixtureDir);
