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
  fs.mkdirSync(path.join(frontend, "app"), { recursive: true });

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
    import { createCmsClient, toNextMetadata, allSchemaJsonLd, renderCmsRichTextHtml, isCmsRichTextBlock } from "@digitalafarin/cms-next";
    if (typeof createCmsClient !== "function") throw new Error("createCmsClient export missing");
    if (typeof toNextMetadata !== "function") throw new Error("toNextMetadata export missing");
    if (typeof allSchemaJsonLd !== "function") throw new Error("allSchemaJsonLd export missing");
    if (typeof renderCmsRichTextHtml !== "function") throw new Error("renderCmsRichTextHtml export missing");
    if (typeof isCmsRichTextBlock !== "function") throw new Error("isCmsRichTextBlock export missing");
    const client = createCmsClient({ baseUrl: "https://cms.example/api/cms/v1", site: "example.com" });
    if (typeof client.resolve !== "function" || typeof client.getMenu !== "function") throw new Error("CMS client surface incomplete");
    console.log("@digitalafarin/cms-next installed tarball import OK");
  `;
  run(process.execPath, ["--input-type=module", "-e", probe], app);

  const cliBin = binPath(app, "digitalafarin-cms");
  if (!fs.existsSync(cliBin)) throw new Error("digitalafarin-cms bin shim was not installed");
  const preDoctor = spawnSync(cliBin, ["doctor", "--frontend", frontend], {
    cwd: app, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: false,
  });
  if (preDoctor.status === 0 || !/Integration plan missing/.test((preDoctor.stdout || "") + (preDoctor.stderr || ""))) {
    throw new Error("doctor must fail clearly before host integration is prepared");
  }
  console.log("@digitalafarin/cms-cli installed tarball executable OK");

  run(cliBin, [
    "init",
    "--frontend", frontend,
    "--skip-install",
    "--with-public-route",
  ], app);
  fs.appendFileSync(path.join(frontend, ".env.local"), "DIGITALAFARIN_CMS_MEDIA_UPSTREAM=http://127.0.0.1:8000/media/\n");
  run(cliBin, ["doctor", "--frontend", frontend], app);
  for (const expected of [
    "lib/digitalafarin-cms.ts",
    "app/[[...cms_path]]/page.tsx",
    "components/digitalafarin-cms/BlockRenderer.tsx",
  ]) {
    if (!fs.existsSync(path.join(frontend, expected))) {
      throw new Error(`cms-cli --with-public-route missing ${expected}`);
    }
  }
  const publicRoute = fs.readFileSync(path.join(frontend, "app", "[[...cms_path]]", "page.tsx"), "utf8");
  if (!publicRoute.includes("cms.resolve")) throw new Error("Generated public route does not resolve CMS content");
  const publicRenderer = fs.readFileSync(path.join(frontend, "components", "digitalafarin-cms", "BlockRenderer.tsx"), "utf8");
  if (!publicRenderer.includes("renderCmsRichTextHtml")) throw new Error("Generated public renderer does not use safe rich text helper");
  console.log("@digitalafarin/cms-cli public route scaffold OK");

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
    "src/components/ProfessionalEditor.tsx",
    "src/components/RichTextEditor.tsx",
    "src/lib/editor-block-adapter.ts",
    "src/styles/professional-editor.css",
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

  const embeddedFrontend = path.join(app, "embedded-frontend");
  fs.mkdirSync(path.join(embeddedFrontend, "app"), { recursive: true });
  fs.writeFileSync(
    path.join(embeddedFrontend, "package.json"),
    JSON.stringify({
      name: "embedded-next-app",
      private: true,
      scripts: { build: "next build" },
      dependencies: {
        next: "^16.3.0",
        react: "^19.3.0",
        "react-dom": "^19.2.0",
      },
    }, null, 2),
  );
  fs.writeFileSync(
    path.join(embeddedFrontend, "app", "layout.tsx"),
    'export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}\n',
  );
  fs.writeFileSync(
    path.join(embeddedFrontend, "app", "page.tsx"),
    'export default function Page(){return <main>Host website</main>}\n',
  );

  run(cliBin, [
    "init",
    "--frontend", embeddedFrontend,
    "--next-package", sdkTarball,
    "--admin-package", adminTarball,
    "--with-admin",
    "--admin-base-path", "/cms",
    "--admin-api-url", "https://api.example.com/api/cms/v1",
  ], app);

  for (const expected of [
    "app/cms/page.tsx",
    "app/cms/login/page.tsx",
    "app/cms/api-proxy/[...path]/route.ts",
    "app/cms/layout.tsx",
    "digitalafarin-cms-admin/components/ProfessionalEditor.tsx",
    "digitalafarin-cms-admin/components/RichTextEditor.tsx",
    "digitalafarin-cms-admin/lib/api.ts",
    "digitalafarin-cms-admin/styles/globals.css",
  ]) {
    if (!fs.existsSync(path.join(embeddedFrontend, expected))) {
      throw new Error(`Embedded admin missing ${expected}`);
    }
  }
  if (fs.existsSync(path.join(app, "cms-admin"))) {
    throw new Error("Embedded admin unexpectedly created a standalone cms-admin directory");
  }

  const embeddedPkg = JSON.parse(fs.readFileSync(path.join(embeddedFrontend, "package.json"), "utf8"));
  if (!embeddedPkg.dependencies?.["@digitalafarin/cms-admin"]) {
    throw new Error("Embedded admin package was not installed into the host frontend");
  }
  if (!fs.existsSync(path.join(embeddedFrontend, "node_modules", "@digitalafarin", "cms-admin"))) {
    throw new Error("Embedded admin package is not present in the host node_modules");
  }

  const embeddedEnv = fs.readFileSync(path.join(embeddedFrontend, ".env.local"), "utf8");
  if (!embeddedEnv.includes("NEXT_PUBLIC_API_URL=/cms/api-proxy")) throw new Error("Embedded Admin proxy URL missing");
  if (!embeddedEnv.includes("DIGITALAFARIN_CMS_API_URL=https://api.example.com/api/cms/v1")) throw new Error("Embedded Admin upstream URL missing");

  const embeddedLayout = fs.readFileSync(path.join(embeddedFrontend, "app", "cms", "layout.tsx"), "utf8");
  if (embeddedLayout.includes("@/digitalafarin-cms-admin")) throw new Error("Embedded Admin unexpectedly requires a host @/* alias");
  const embeddedSidebar = fs.readFileSync(path.join(embeddedFrontend, "digitalafarin-cms-admin", "components", "Sidebar.tsx"), "utf8");
  if (!embeddedSidebar.includes("adminPath(href)")) throw new Error("Embedded sidebar does not preserve /cms base path");

  run(npm, ["run", "build"], embeddedFrontend);
  console.log("@digitalafarin/cms-cli embedded admin integration/build OK");
} finally {
  for (const tarball of tarballs) {
    try { fs.rmSync(tarball, { force: true }); } catch {}
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
