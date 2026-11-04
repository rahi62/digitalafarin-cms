import fs from "node:fs";
import path from "node:path";

const exists = (file) => {
  try { return fs.statSync(file).isFile(); } catch { return false; }
};

const MODULE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** `config.settings.dev` -> backend/config/settings/dev.py (or dev/__init__.py). */
export function moduleToFile(backend, moduleName) {
  if (!MODULE_NAME.test(moduleName)) return null;
  const base = path.join(backend, ...moduleName.split("."));
  if (exists(base + ".py")) return base + ".py";
  if (exists(path.join(base, "__init__.py"))) return path.join(base, "__init__.py");
  return null;
}

function resolveInsideBackend(backend, value, label) {
  const resolved = path.resolve(backend, value);
  const root = path.resolve(backend) + path.sep;
  if (!resolved.startsWith(root)) throw new Error(`${label} must be inside the backend directory: ${value}`);
  if (!exists(resolved)) throw new Error(`${label} not found: ${resolved}`);
  return resolved;
}

/** Module name of a settings/urls file relative to the backend root. */
function fileToModule(backend, file) {
  const relative = path.relative(backend, file).split(path.sep).join("/").replace(/\.py$/, "");
  return relative.replace(/\/__init__$/, "").split("/").join(".");
}

function detectSettingsModule(backend) {
  const sources = ["manage.py", "wsgi.py", "asgi.py"].map((name) => path.join(backend, name)).filter(exists);
  for (const source of sources) {
    const match = fs.readFileSync(source, "utf8").match(/DJANGO_SETTINGS_MODULE["']\s*,\s*["']([^"']+)["']/);
    if (match) return match[1];
  }
  if (process.env.DJANGO_SETTINGS_MODULE) return process.env.DJANGO_SETTINGS_MODULE;
  throw new Error("Could not detect DJANGO_SETTINGS_MODULE. Pass --settings-file (and --urls-file) explicitly.");
}

/** Resolve `from .base import *`, `from . import base`, `from config.settings.base import *`. */
function importedSettingsFiles(backend, file, text) {
  const here = fileToModule(backend, file);
  const isPackage = path.basename(file) === "__init__.py";
  const pkg = isPackage ? here : here.split(".").slice(0, -1).join(".");
  const found = [];
  for (const match of text.matchAll(/^\s*from\s+(\.*)([A-Za-z0-9_.]*)\s+import\s+([^\n#]+)/gm)) {
    const [, dots, mod, names] = match;
    let base;
    if (dots) {
      const parts = pkg ? pkg.split(".") : [];
      const up = parts.slice(0, Math.max(0, parts.length - (dots.length - 1)));
      base = [...up, ...(mod ? [mod] : [])].join(".");
    } else {
      base = mod;
    }
    const candidates = [base];
    if (/^\s*\(?\s*\w/.test(names) && !names.trim().startsWith("*")) {
      for (const name of names.replace(/[()]/g, "").split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        candidates.push(base ? `${base}.${name}` : name);
      }
    }
    for (const candidate of candidates) {
      const resolved = candidate && moduleToFile(backend, candidate);
      if (resolved && resolved !== file) found.push(resolved);
    }
  }
  return found;
}

/** ROOT_URLCONF from the settings module, following imports of base settings (depth-limited). */
export function detectRootUrlconf(backend, settingsFile, seen = new Set(), depth = 0) {
  if (seen.has(settingsFile) || depth > 6) return null;
  seen.add(settingsFile);
  const text = fs.readFileSync(settingsFile, "utf8");
  const own = text.match(/^\s*ROOT_URLCONF\s*=\s*["']([^"']+)["']/m);
  if (own) return own[1];
  for (const imported of importedSettingsFiles(backend, settingsFile, text)) {
    const found = detectRootUrlconf(backend, imported, seen, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Locate the settings and URLconf files to patch.
 * Order: explicit flags, then ROOT_URLCONF read from the settings module, then a sibling `urls.py` guess.
 */
export function inferDjangoFiles(backend, overrides = {}) {
  const settingsFile = overrides.settingsFile
    ? resolveInsideBackend(backend, overrides.settingsFile, "Settings file")
    : (() => {
      const moduleName = detectSettingsModule(backend);
      const file = moduleToFile(backend, moduleName);
      if (!file) throw new Error(`Settings file not found for module ${moduleName}. Pass --settings-file.`);
      return file;
    })();

  if (overrides.urlsFile) {
    return { settingsFile, urlsFile: resolveInsideBackend(backend, overrides.urlsFile, "URLs file"), urlsSource: "flag" };
  }
  const rootUrlconf = detectRootUrlconf(backend, settingsFile);
  if (rootUrlconf) {
    const file = moduleToFile(backend, rootUrlconf);
    if (!file) throw new Error(`ROOT_URLCONF is ${rootUrlconf} but its file was not found under ${backend}. Pass --urls-file.`);
    return { settingsFile, urlsFile: file, urlsSource: "ROOT_URLCONF" };
  }
  const sibling = path.join(path.dirname(settingsFile), "urls.py");
  if (exists(sibling)) return { settingsFile, urlsFile: sibling, urlsSource: "guess" };
  const parent = path.join(path.dirname(path.dirname(settingsFile)), "urls.py");
  if (exists(parent)) return { settingsFile, urlsFile: parent, urlsSource: "guess" };
  throw new Error("Could not find ROOT_URLCONF or a urls.py next to the settings. Pass --urls-file.");
}
