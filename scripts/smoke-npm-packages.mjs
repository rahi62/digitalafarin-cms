import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "digitalafarin-npm-smoke-"));
const tarballs = [];

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
  return result.stdout || "";
}

function pack(packageDir) {
  const stdout = run(npm, ["pack", "--json"], packageDir, true);
  const payload = JSON.parse(stdout);
  const filename = payload?.[0]?.filename;
  if (!filename) throw new Error(`npm pack did not return a filename for ${packageDir}`);
  const tarball = path.join(packageDir, filename);
  if (!fs.existsSync(tarball)) throw new Error(`npm tarball not found: ${tarball}`);
  tarballs.push(tarball);
  return tarball;
}

function binPath(app, name) {
  return path.join(
    app,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
}

try {
  const sdkTarball = pack(path.join(root, "packages", "cms-next"));
  const cliTarball = pack(path.join(root, "packages", "cms-cli"));
  const adminTarball = pack(path.join(root, "apps", "admin"));
  const app = path.join(tempRoot, "consumer");
  const frontend = path.join(app, "frontend");
  fs.mkdirSync(frontend, { recursive: true });

  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ name: "digitalafarin-package-smoke", private: true, type: "module" }, null, 2),
  );
  fs.writeFileSync(
    path.join(frontend, "package.json"),
    JSON.stringify({ name: "fake-next-app", private: true, dependencies: { next: "15.0.0" } }, null, 2),
  );

  run(
    npm,
    ["install", "--ignore-scripts", "--legacy-peer-deps", sdkTarball, cliTarball, adminTarball],
    app,
  );

  const probe = `
    import { createCmsClient, toNextMetadata, allSchemaJsonLd } from "@digitalafarin/cms-next";
    if (typeof createCmsClient !== "function") throw new Error("createCmsClient export missing");
    if (typeof toNextMetadata !== "function") throw new Error("toNextMetadata export missing");
    if (typeof allSchemaJsonLd !== "function") throw new Error("allSchemaJsonLd export missing");
    const client = createCmsClient({ baseUrl: "https://cms.example/api/cms/v1", site: "example.com" });
    if (typeof client.resolve !== "function" || typeof client.getMenu !== "function") throw new Error("CMS client surface incomplete");
    console.log("@digitalafarin/cms-next installed tarball import OK");
  `;
  run(process.execPath, ["--input-type=module", "-e", probe], app);

  const cliBin = binPath(app, "digitalafarin-cms");
  if (!fs.existsSync(cliBin)) throw new Error("digitalafarin-cms bin shim was not installed");
  run(cliBin, ["doctor", "--frontend", frontend], app);
  console.log("@digitalafarin/cms-cli installed tarball executable OK");

  const adminBin = binPath(app, "digitalafarin-cms-admin");
  if (!fs.existsSync(adminBin)) throw new Error("digitalafarin-cms-admin bin shim was not installed");

  const directAdmin = path.join(app, "direct-admin");
  run(adminBin, [
    "scaffold",
    "--dir", directAdmin,
    "--base-path", "/cms",
    "--api-url", "https://api.example.com/api/cms/v1",
    "--port", "3001",
    "--skip-install",
  ], app);

  for (const expected of [
    "package.json",
    "next.config.ts",
    "tsconfig.json",
    ".env.local",
    "src/app/page.tsx",
    "src/app/login/page.tsx",
    "src/app/api-proxy/[...path]/route.ts",
    "deploy/nginx.cms.conf",
  ]) {
    if (!fs.existsSync(path.join(directAdmin, expected))) throw new Error(`Admin scaffold missing ${expected}`);
  }
  const env = fs.readFileSync(path.join(directAdmin, ".env.local"), "utf8");
  if (!env.includes("NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH=/cms")) throw new Error("Admin base path was not scaffolded");
  if (!env.includes("NEXT_PUBLIC_API_URL=/cms/api-proxy")) throw new Error("Same-origin browser API proxy URL was not scaffolded");
  if (!env.includes("DIGITALAFARIN_CMS_API_URL=https://api.example.com/api/cms/v1")) throw new Error("Django upstream API URL was not scaffolded");
  const proxyRoute = fs.readFileSync(path.join(directAdmin, "src", "app", "api-proxy", "[...path]", "route.ts"), "utf8");
  if (!proxyRoute.includes('incomingUrl.pathname.endsWith("/")')) throw new Error("Admin API proxy does not preserve trailing slashes");
  const nginx = fs.readFileSync(path.join(directAdmin, "deploy", "nginx.cms.conf"), "utf8");
  if (!nginx.includes("location /cms/")) throw new Error("Nginx /cms route missing");
  console.log("@digitalafarin/cms-admin installed tarball scaffold OK");

  const cliAdmin = path.join(app, "cli-admin");
  run(cliBin, [
    "admin",
    "--admin-package", adminTarball,
    "--admin-dir", cliAdmin,
    "--admin-base-path", "/cms",
    "--admin-api-url", "https://api.example.com/api/cms/v1",
    "--admin-port", "3002",
    "--skip-install",
  ], app);
  if (!fs.existsSync(path.join(cliAdmin, "src", "app", "page.tsx"))) throw new Error("cms-cli admin command did not scaffold admin app");
  const cliEnv = fs.readFileSync(path.join(cliAdmin, ".env.local"), "utf8");
  if (!cliEnv.includes("NEXT_PUBLIC_API_URL=/cms/api-proxy")) throw new Error("cms-cli admin command did not configure same-origin API proxy");
  console.log("@digitalafarin/cms-cli admin integration OK");
} finally {
  for (const tarball of tarballs) {
    try { fs.rmSync(tarball, { force: true }); } catch {}
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
