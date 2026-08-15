import fs from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: npm run version:set -- 0.2.1");
  process.exit(2);
}

for (const file of ["package.json", "packages/cms-next/package.json", "packages/cms-cli/package.json"]) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.version = version;
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

const pyprojectPath = "packages/cms-django/pyproject.toml";
let pyproject = fs.readFileSync(pyprojectPath, "utf8");
pyproject = pyproject.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
fs.writeFileSync(pyprojectPath, pyproject);

const initPath = "packages/cms-django/src/digitalafarin_cms/__init__.py";
let init = fs.readFileSync(initPath, "utf8");
init = init.replace(/^__version__\s*=\s*"[^"]+"/m, `__version__ = "${version}"`);
fs.writeFileSync(initPath, init);

console.log(`Set all publishable package versions to ${version}.`);
