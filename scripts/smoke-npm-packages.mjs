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

try {
  const sdkTarball = pack(path.join(root, "packages", "cms-next"));
  const cliTarball = pack(path.join(root, "packages", "cms-cli"));
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
    ["install", "--ignore-scripts", "--legacy-peer-deps", sdkTarball, cliTarball],
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

  const bin = path.join(
    app,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "digitalafarin-cms.cmd" : "digitalafarin-cms",
  );
  if (!fs.existsSync(bin)) throw new Error("digitalafarin-cms bin shim was not installed");
  run(bin, ["doctor", "--frontend", frontend], app);

  console.log("@digitalafarin/cms-cli installed tarball executable OK");
} finally {
  for (const tarball of tarballs) {
    try { fs.rmSync(tarball, { force: true }); } catch {}
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
