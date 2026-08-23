#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const command = args[0] || "init";
if (!["init", "doctor", "admin"].includes(command)) {
  console.error("Usage: digitalafarin-cms [init|doctor|admin] [--backend DIR] [--frontend DIR] [--python CMD] [--skip-install] [--skip-migrate] [--with-admin] [--admin-dir DIR] [--admin-base-path /cms] [--admin-api-url URL] [--admin-port 3001]");
  process.exit(2);
}

function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
function has(name) { return args.includes(name); }
function exists(file) { return fs.existsSync(file); }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }

const cwd = process.cwd();
const candidates = [".", "backend", "frontend", "web", "apps/backend", "apps/frontend", "apps/web"];
function detectBackend() {
  const explicit = arg("--backend");
  if (explicit) return path.resolve(cwd, explicit);
  for (const rel of candidates) {
    const dir = path.resolve(cwd, rel);
    if (exists(path.join(dir, "manage.py"))) return dir;
  }
  return null;
}
function detectFrontend() {
  const explicit = arg("--frontend");
  if (explicit) return path.resolve(cwd, explicit);
  for (const rel of candidates) {
    const dir = path.resolve(cwd, rel);
    const pkg = readJson(path.join(dir, "package.json"));
    if (pkg && (pkg.dependencies?.next || pkg.devDependencies?.next)) return dir;
  }
  return null;
}
function run(cmd, cmdArgs, options = {}) {
  console.log(`> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: process.platform === "win32", ...options });
  if (r.status !== 0) throw new Error(`${cmd} exited with code ${r.status}`);
}
function appendBlock(file, begin, end, body) {
  let text = fs.readFileSync(file, "utf8");
  if (text.includes(begin)) return false;
  if (!text.endsWith("\n")) text += "\n";
  text += `\n${begin}\n${body.trim()}\n${end}\n`;
  fs.writeFileSync(file, text);
  return true;
}
function inferDjangoFiles(backend) {
  const manage = fs.readFileSync(path.join(backend, "manage.py"), "utf8");
  const match = manage.match(/DJANGO_SETTINGS_MODULE["']\s*,\s*["']([^"']+)["']/);
  if (!match) throw new Error("Could not detect DJANGO_SETTINGS_MODULE from manage.py. Pass a conventional Django project or wire package manually.");
  const moduleName = match[1];
  const parts = moduleName.split(".");
  const settingsFile = path.join(backend, ...parts) + ".py";
  const urlsFile = path.join(backend, ...parts.slice(0, -1), "urls.py");
  if (!exists(settingsFile)) throw new Error(`Settings file not found: ${settingsFile}`);
  if (!exists(urlsFile)) throw new Error(`URLs file not found: ${urlsFile}`);
  return { settingsFile, urlsFile };
}
function ensureEnv(frontend) {
  const envFile = path.join(frontend, ".env.local");
  let text = exists(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const lines = [];
  if (!/^DIGITALAFARIN_CMS_URL=/m.test(text)) lines.push("DIGITALAFARIN_CMS_URL=http://localhost:8000/api/cms/v1");
  if (!/^DIGITALAFARIN_CMS_SITE=/m.test(text)) lines.push("DIGITALAFARIN_CMS_SITE=localhost:3000");
  if (lines.length) {
    if (text && !text.endsWith("\n")) text += "\n";
    text += lines.join("\n") + "\n";
    fs.writeFileSync(envFile, text);
  }
}
function ensureNextAdapter(frontend) {
  const useSrc = exists(path.join(frontend, "src"));
  const lib = path.join(frontend, useSrc ? "src" : "", "lib");
  fs.mkdirSync(lib, { recursive: true });
  const file = path.join(lib, "digitalafarin-cms.ts");
  if (!exists(file)) {
    fs.writeFileSync(file, `import { createCmsClientFromEnv } from "@digitalafarin/cms-next";\n\nexport const cms = createCmsClientFromEnv({ revalidate: 60 });\n`);
  }
}
function scaffoldAdmin() {
  const adminPackage = arg("--admin-package", "@digitalafarin/cms-admin");
  const adminDir = arg("--admin-dir", "cms-admin");
  const adminBasePath = arg("--admin-base-path", "/cms");
  const adminApiUrl = arg("--admin-api-url", "http://localhost:8000/api/cms/v1");
  const adminPort = arg("--admin-port", "3001");
  const commandArgs = [
    "exec",
    "--yes",
    `--package=${adminPackage}`,
    "--",
    "digitalafarin-cms-admin",
    "scaffold",
    "--dir", adminDir,
    "--base-path", adminBasePath,
    "--api-url", adminApiUrl,
    "--port", adminPort,
  ];
  if (has("--skip-install")) commandArgs.push("--skip-install");
  if (has("--force-admin")) commandArgs.push("--force");
  run("npm", commandArgs, { cwd });
}

const backend = detectBackend();
const frontend = detectFrontend();
console.log(`Django: ${backend || "not detected"}`);
console.log(`Next.js: ${frontend || "not detected"}`);

if (command === "doctor") {
  process.exit(backend || frontend ? 0 : 1);
}

if (command === "admin") {
  scaffoldAdmin();
  process.exit(0);
}

if (!backend && !frontend && !has("--with-admin")) {
  throw new Error("No Django or Next.js project detected. Use --backend and/or --frontend, or pass --with-admin to scaffold only the CMS Admin app.");
}

const skipInstall = has("--skip-install");
const python = arg("--python", process.env.PYTHON || "python");
const djangoPackage = arg("--django-package", "digitalafarin-cms[all]");
const nextPackage = arg("--next-package", "@digitalafarin/cms-next");

if (backend) {
  if (!skipInstall) run(python, ["-m", "pip", "install", djangoPackage], { cwd: backend });
  const { settingsFile, urlsFile } = inferDjangoFiles(backend);
  appendBlock(
    settingsFile,
    "# BEGIN DIGITALAFARIN CMS",
    "# END DIGITALAFARIN CMS",
    `from digitalafarin_cms.settings import apply_defaults as _digitalafarin_cms_apply_defaults\n_digitalafarin_cms_apply_defaults(globals())`
  );
  appendBlock(
    urlsFile,
    "# BEGIN DIGITALAFARIN CMS",
    "# END DIGITALAFARIN CMS",
    `from django.urls import include as _digitalafarin_cms_include, path as _digitalafarin_cms_path\nurlpatterns += [_digitalafarin_cms_path("api/cms/v1/", _digitalafarin_cms_include("digitalafarin_cms.urls"))]`
  );
  if (!has("--skip-migrate")) run(python, ["manage.py", "migrate"], { cwd: backend });
}

if (frontend) {
  if (!skipInstall) run("npm", ["install", nextPackage], { cwd: frontend });
  ensureEnv(frontend);
  ensureNextAdapter(frontend);
}

if (has("--with-admin")) scaffoldAdmin();

console.log("\nDigitalAfarin CMS wiring complete.");
console.log("Backend API default: /api/cms/v1/");
console.log("Next adapter: lib/digitalafarin-cms.ts (or src/lib/...)");
if (has("--with-admin")) console.log(`CMS Admin: ${arg("--admin-base-path", "/cms")} on port ${arg("--admin-port", "3001")}`);
