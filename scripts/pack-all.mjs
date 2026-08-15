import { spawnSync } from "node:child_process";
import fs from "node:fs";

fs.mkdirSync("dist", { recursive: true });
const run = (cmd, args, cwd = process.cwd()) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("npm", ["run", "build"], "packages/cms-next");
run("npm", ["pack", "--pack-destination", "../../dist"], "packages/cms-next");
run("npm", ["pack", "--pack-destination", "../../dist"], "packages/cms-cli");
console.log("npm packages written to dist/. Build the Python package with: python -m build packages/cms-django --outdir dist");
