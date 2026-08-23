import fs from "node:fs";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const rootVersion = readJson("package.json").version;
const npmWorkspaces = [
  "apps/admin",
  "packages/cms-next",
  "packages/cms-cli",
];

const versions = new Map([["package.json", rootVersion]]);
for (const workspace of npmWorkspaces) {
  versions.set(`${workspace}/package.json`, readJson(`${workspace}/package.json`).version);
}

const pyproject = fs.readFileSync("packages/cms-django/pyproject.toml", "utf8");
const pyMatch = pyproject.match(/^version\s*=\s*"([^"]+)"/m);
if (!pyMatch) throw new Error("Could not find Python package version");
versions.set("packages/cms-django/pyproject.toml", pyMatch[1]);

const init = fs.readFileSync("packages/cms-django/src/digitalafarin_cms/__init__.py", "utf8");
const initMatch = init.match(/^__version__\s*=\s*"([^"]+)"/m);
if (!initMatch) throw new Error("Could not find digitalafarin_cms.__version__");
versions.set("digitalafarin_cms.__version__", initMatch[1]);

if (fs.existsSync("package-lock.json")) {
  const lock = readJson("package-lock.json");
  versions.set("package-lock.json", lock.version);
  versions.set("package-lock.json#packages[root]", lock.packages?.[""]?.version);
  for (const workspace of npmWorkspaces) {
    versions.set(`package-lock.json#${workspace}`, lock.packages?.[workspace]?.version);
  }
}

const bad = [...versions].filter(([, v]) => v !== rootVersion);
if (bad.length) {
  console.error(`Version mismatch. Expected ${rootVersion}:`);
  for (const [file, version] of bad) console.error(`- ${file}: ${version ?? "missing"}`);
  process.exit(1);
}
console.log(`All publishable packages and lockfile metadata are synchronized at ${rootVersion}.`);
