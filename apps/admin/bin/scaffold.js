#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(__filename), "..");
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args.shift() : "scaffold";

if (!["scaffold", "embed"].includes(command)) {
  console.error("Usage: digitalafarin-cms-admin [embed|scaffold] [options]");
  process.exit(2);
}

function arg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
function has(name) { return args.includes(name); }
function normalizeBasePath(value) {
  const raw = String(value || "/cms").trim();
  if (!raw || raw === "/") return "";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}
function run(commandName, commandArgs, cwd) {
  console.log(`> ${commandName} ${commandArgs.join(" ")}`);
  const result = spawnSync(commandName, commandArgs, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`${commandName} exited with code ${result.status}`);
}
function copyTree(source, destination, transform) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to, transform);
    else if (transform && /\.(ts|tsx|js|jsx|css)$/.test(entry.name)) {
      fs.writeFileSync(to, transform(fs.readFileSync(from, "utf8"), from, to));
    } else {
      fs.copyFileSync(from, to);
    }
  }
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}
function detectSourceRoot(frontend) {
  if (fs.existsSync(path.join(frontend, "src", "app"))) return path.join(frontend, "src");
  if (fs.existsSync(path.join(frontend, "app"))) return frontend;
  throw new Error("Embedded CMS Admin requires a Next.js App Router project with app/ or src/app/.");
}
function ensureEnvValue(file, key, value) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (pattern.test(text)) text = text.replace(pattern, line);
  else {
    if (text && !text.endsWith("\n")) text += "\n";
    text += `${line}\n`;
  }
  fs.writeFileSync(file, text);
}
function importPath(fromFile, targetDirectory) {
  let relative = path.relative(path.dirname(fromFile), targetDirectory).replaceAll(path.sep, "/");
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return relative;
}
function embeddedTransformFor(embeddedRoot) {
  return (text, _from, to) => {
    const components = importPath(to, path.join(embeddedRoot, "components"));
    const lib = importPath(to, path.join(embeddedRoot, "lib"));
    const styles = importPath(to, path.join(embeddedRoot, "styles"));
    return text
      .replaceAll('from "@/components/', `from "${components}/`)
      .replaceAll('from "@/lib/', `from "${lib}/`)
      .replaceAll('from "@/styles/', `from "${styles}/`);
  };
}
function scopeGlobalCss(text) {
  return text
    .replace(
      /^\*\{box-sizing:border-box\}html,body\{margin:0;background:#f5f7fb;color:#172033;font-family:Tahoma,Arial,sans-serif\}a\{text-decoration:none;color:inherit\}button,input,textarea,select\{font:inherit\}/,
      ".digitalafarinCmsAdmin,.digitalafarinCmsAdmin *{box-sizing:border-box}.digitalafarinCmsAdmin{margin:0;background:#f5f7fb;color:#172033;font-family:Tahoma,Arial,sans-serif;min-height:100vh}.digitalafarinCmsAdmin a{text-decoration:none;color:inherit}.digitalafarinCmsAdmin button,.digitalafarinCmsAdmin input,.digitalafarinCmsAdmin textarea,.digitalafarinCmsAdmin select{font:inherit}",
    );
}

function embed() {
  const frontend = path.resolve(process.cwd(), arg("--frontend", "."));
  const pkg = readJson(path.join(frontend, "package.json"));
  if (!pkg || !(pkg.dependencies?.next || pkg.devDependencies?.next)) {
    throw new Error(`Target is not a Next.js project: ${frontend}`);
  }

  const sourceRoot = detectSourceRoot(frontend);
  const appDir = path.join(sourceRoot, "app");
  const basePath = normalizeBasePath(arg("--base-path", "/cms")) || "/cms";
  const apiUrl = arg("--api-url", "http://127.0.0.1:8000/api/cms/v1");
  const force = has("--force");
  const skipInstall = has("--skip-install");
  const requiredDevDependencies = ["typescript", "@types/node", "@types/react", "@types/react-dom"];
  const missingDevDependencies = requiredDevDependencies.filter(
    (name) => !pkg.dependencies?.[name] && !pkg.devDependencies?.[name],
  );
  if (missingDevDependencies.length && !skipInstall) {
    run("npm", ["install", "--save-dev", ...missingDevDependencies], frontend);
  }
  const routeSegments = basePath.split("/").filter(Boolean);
  const routeDir = path.join(appDir, ...routeSegments);
  const embeddedRoot = path.join(sourceRoot, "digitalafarin-cms-admin");

  if (fs.existsSync(routeDir) && fs.readdirSync(routeDir).length > 0 && !force) {
    throw new Error(`CMS route already exists: ${routeDir}. Use --force only if you intend to refresh generated CMS files.`);
  }

  fs.mkdirSync(routeDir, { recursive: true });
  fs.mkdirSync(embeddedRoot, { recursive: true });

  const transform = embeddedTransformFor(embeddedRoot);
  copyTree(path.join(packageRoot, "src", "components"), path.join(embeddedRoot, "components"), transform);
  copyTree(path.join(packageRoot, "src", "lib"), path.join(embeddedRoot, "lib"), transform);
  copyTree(path.join(packageRoot, "src", "styles"), path.join(embeddedRoot, "styles"), transform);

  const globals = scopeGlobalCss(
    fs.readFileSync(path.join(packageRoot, "src", "app", "globals.css"), "utf8"),
  );
  fs.writeFileSync(path.join(embeddedRoot, "styles", "globals.css"), globals);

  const adminApp = path.join(packageRoot, "src", "app");
  for (const entry of fs.readdirSync(adminApp, { withFileTypes: true })) {
    if (entry.name === "layout.tsx" || entry.name === "globals.css") continue;
    const from = path.join(adminApp, entry.name);
    const to = path.join(routeDir, entry.name);
    if (entry.isDirectory()) copyTree(from, to, transform);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      fs.writeFileSync(to, transform(fs.readFileSync(from, "utf8"), from, to));
    }
  }

  const layoutFile = path.join(routeDir, "layout.tsx");
  const styleRoot = importPath(layoutFile, path.join(embeddedRoot, "styles"));
  const componentRoot = importPath(layoutFile, path.join(embeddedRoot, "components"));
  const styleImports = [
    "globals.css",
    "editor-v03.css",
    "media.css",
    "content-builder.css",
    "taxonomy-menu.css",
    "editorial-workflow.css",
    "audit-v2.css",
    "audit-trends.css",
    "site-settings.css",
    "search-performance.css",
    "seo-opportunities.css",
    "professional-editor.css",
  ].map((name) => `import "${styleRoot}/${name}";`).join("\n");

  fs.writeFileSync(
    layoutFile,
    `${styleImports}
import Shell from "${componentRoot}/Shell";

export const metadata = {
  title: "DigitalAfarin SEO CMS",
  description: "Headless CMS & SEO Platform",
};

export default function DigitalAfarinCmsLayout({ children }: { children: React.ReactNode }) {
  return <div className="digitalafarinCmsAdmin" lang="fa" dir="rtl"><Shell>{children}</Shell></div>;
}
`,
  );

  const envFile = path.join(frontend, ".env.local");
  ensureEnvValue(envFile, "NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH", basePath);
  ensureEnvValue(envFile, "NEXT_PUBLIC_API_URL", `${basePath}/api-proxy`);
  ensureEnvValue(envFile, "DIGITALAFARIN_CMS_API_URL", apiUrl);

  console.log("\nDigitalAfarin CMS Admin embedded successfully.");
  console.log(`Frontend: ${frontend}`);
  console.log(`Route: ${basePath}/`);
  console.log("Runtime: host Next.js application (no separate CMS node_modules)");
  if (missingDevDependencies.length) console.log(`TypeScript tooling ensured: ${missingDevDependencies.join(", ")}`);
  console.log(`Django upstream: ${apiUrl}`);
}

function scaffoldStandalone() {
  const destination = path.resolve(process.cwd(), arg("--dir", "cms-admin"));
  const basePath = normalizeBasePath(arg("--base-path", "/cms"));
  const apiUrl = arg("--api-url", "http://127.0.0.1:8000/api/cms/v1");
  const port = arg("--port", "3001");
  const force = has("--force");
  const skipInstall = has("--skip-install");
  const route = basePath || "/cms";
  const browserApiUrl = `${route}/api-proxy`;

  if (fs.existsSync(destination) && fs.readdirSync(destination).length > 0 && !force) {
    throw new Error(`Target directory is not empty: ${destination}. Use --force only if you intend to overwrite generated CMS Admin files.`);
  }

  fs.mkdirSync(destination, { recursive: true });
  copyTree(path.join(packageRoot, "src"), path.join(destination, "src"));
  fs.copyFileSync(path.join(packageRoot, "next.config.ts"), path.join(destination, "next.config.ts"));
  fs.copyFileSync(path.join(packageRoot, "tsconfig.json"), path.join(destination, "tsconfig.json"));

  const ownPackage = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const appPackage = {
    name: "digitalafarin-cms-admin-app",
    version: ownPackage.version,
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start", typecheck: "tsc --noEmit" },
    dependencies: {
      ...ownPackage.dependencies,
      next: ownPackage.devDependencies.next,
      react: ownPackage.devDependencies.react,
      "react-dom": ownPackage.devDependencies["react-dom"],
    },
    devDependencies: {
      typescript: ownPackage.devDependencies.typescript,
      "@types/node": ownPackage.devDependencies["@types/node"],
      "@types/react": ownPackage.devDependencies["@types/react"],
      "@types/react-dom": ownPackage.devDependencies["@types/react-dom"],
    },
  };
  fs.writeFileSync(path.join(destination, "package.json"), `${JSON.stringify(appPackage, null, 2)}\n`);

  const env = [
    `NEXT_PUBLIC_DIGITALAFARIN_CMS_ADMIN_BASE_PATH=${basePath || "/"}`,
    `NEXT_PUBLIC_API_URL=${browserApiUrl}`,
    `DIGITALAFARIN_CMS_API_URL=${apiUrl}`,
    `PORT=${port}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(destination, ".env.local"), env);
  fs.writeFileSync(path.join(destination, ".env.example"), env);

  const deployDir = path.join(destination, "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const nginx = `# Include inside the HTTPS server block for your main website.
location = ${route} {
    return 308 ${route}/;
}
location ${route}/ {
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass http://127.0.0.1:${port};
}
`;
  fs.writeFileSync(path.join(deployDir, "nginx.cms.conf"), nginx);

  if (!skipInstall) run("npm", ["install"], destination);

  console.log("\nStandalone DigitalAfarin CMS Admin scaffolded successfully.");
  console.log(`Directory: ${destination}`);
  console.log(`Base path: ${route}`);
}

if (command === "embed") embed();
else scaffoldStandalone();
