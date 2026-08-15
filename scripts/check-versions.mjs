import fs from "node:fs";

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const rootVersion = readJson("package.json").version;
const versions = new Map([
  ["package.json", rootVersion],
  ["packages/cms-next/package.json", readJson("packages/cms-next/package.json").version],
  ["packages/cms-cli/package.json", readJson("packages/cms-cli/package.json").version],
]);

const pyproject = fs.readFileSync("packages/cms-django/pyproject.toml", "utf8");
const pyMatch = pyproject.match(/^version\s*=\s*"([^"]+)"/m);
if (!pyMatch) throw new Error("Could not find Python package version");
versions.set("packages/cms-django/pyproject.toml", pyMatch[1]);

const init = fs.readFileSync("packages/cms-django/src/digitalafarin_cms/__init__.py", "utf8");
const initMatch = init.match(/^__version__\s*=\s*"([^"]+)"/m);
if (!initMatch) throw new Error("Could not find digitalafarin_cms.__version__");
versions.set("digitalafarin_cms.__version__", initMatch[1]);

const bad = [...versions].filter(([, v]) => v !== rootVersion);
if (bad.length) {
  console.error(`Version mismatch. Expected ${rootVersion}:`);
  for (const [file, version] of bad) console.error(`- ${file}: ${version}`);
  process.exit(1);
}
console.log(`All publishable packages are synchronized at ${rootVersion}.`);
