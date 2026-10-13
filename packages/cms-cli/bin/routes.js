import fs from 'node:fs';
import path from 'node:path';

const PAGE_FILE = /^(page|route)\.(?:[jt]sx?|mdx)$/;
const RESERVED = new Set(['api', 'media', '_next', 'static', 'cms', 'admin', 'digitalafarin-cms-preview', '__cms_preview']);
const MODES = new Set(['page', 'collection', 'detail']);
const SOURCE = new Set(['cms', 'host']);
const slash = (value) => value.split(path.sep).join('/');
const signature = (url) => url.split('/').map((part) => /^\[\[\.\.\./.test(part) ? '[optional-catch-all]' : /^\[\.\.\./.test(part) ? '[catch-all]' : /^\[.+\]$/.test(part) ? '[dynamic]' : part).join('/');

function parseSegment(segment) {
  if (/^\([^/]+\)$/.test(segment)) return { segment: '', routeGroup: true };
  if (segment.startsWith('@')) return { segment: '', parallel: true };
  if (/^\(\.{1,3}\)/.test(segment)) return { segment: segment.replace(/^\(\.{1,3}\)/, ''), intercepted: true };
  return { segment };
}

function routeShape(segments) {
  const parsed = segments.map(parseSegment);
  const canonical = parsed.map((item) => item.segment).filter(Boolean);
  const url = '/' + canonical.join('/');
  const dynamic = canonical.some((part) => /^\[.+\]$/.test(part));
  const catchAll = canonical.some((part) => /^\[{1,2}\.\.\./.test(part));
  const root = (canonical[0] || '').toLowerCase();
  return {
    url,
    route_kind: catchAll ? 'catch-all' : dynamic ? 'dynamic' : 'static',
    reserved: RESERVED.has(root),
    parallel: parsed.some((item) => item.parallel),
    intercepted: parsed.some((item) => item.intercepted),
    groups: segments.filter((part) => /^\([^/]+\)$/.test(part)),
  };
}

export function inventory(frontend, root) {
  const routes = [];
  const app = path.join(root, 'app');
  function walk(directory, segments = []) {
    if (!fs.existsSync(directory)) return;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) {
        if (item.name.startsWith('_') || item.name.startsWith('.')) continue;
        walk(absolute, [...segments, item.name]);
      } else if (item.isFile()) {
        const match = PAGE_FILE.exec(item.name);
        if (!match) continue;
        const shape = routeShape(segments);
        const content = fs.readFileSync(absolute, 'utf8');
        const usesCmsCollection = /\b(?:cms\.)?listEntries\s*\(/.test(content);
        const usesCmsDetail = /\b(?:cms\.)?(?:resolveForRoute|resolve)\s*\(/.test(content);
        routes.push({
          ...shape,
          file: slash(path.relative(frontend, absolute)),
          kind: match[1],
          loader: usesCmsCollection ? 'cms-collection' : usesCmsDetail ? 'cms-detail' : 'unknown',
        });
      }
    }
  }
  walk(app);
  return routes.sort((a, b) => a.url.localeCompare(b.url) || a.file.localeCompare(b.file));
}

export function routeMapFile(frontend) {
  return path.join(frontend, '.digitalafarin', 'route-map.json');
}

export function readRouteMap(frontend) {
  const filename = routeMapFile(frontend);
  if (!fs.existsSync(filename)) return { version: 1, mappings: [] };
  const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (value.version !== 1 || !Array.isArray(value.mappings)) throw new Error('Unsupported CMS route-map format.');
  return value;
}

export function mapRoute(frontend, root, { route, mode, contentType, source = 'cms' }) {
  if (typeof route !== 'string' || !route.startsWith('/') || route.includes('?') || route.includes('#')) {
    throw new Error('Use an exact route pattern beginning with /, such as /blog/[slug].');
  }
  if (!MODES.has(mode)) throw new Error('Route mode must be page, collection or detail.');
  if (!SOURCE.has(source)) throw new Error('Route source must be cms or host.');
  if (source === 'cms' && !/^[a-zA-Z0-9_-]+$/.test(contentType || '')) {
    throw new Error('CMS mappings require a content type slug, such as post.');
  }
  const matches = inventory(frontend, root).filter((item) => item.url === route && item.kind === 'page' && !item.parallel && !item.intercepted);
  if (matches.length !== 1) throw new Error(`Route ${route} must resolve to exactly one ordinary page.tsx/jsx. Found ${matches.length}.`);
  const target = matches[0];
  if (target.reserved) throw new Error(`Refusing to map infrastructure route ${route}.`);
  if (mode === 'detail' && target.route_kind === 'static') throw new Error('Detail mappings require a dynamic route.');
  if (mode === 'collection' && target.route_kind !== 'static') throw new Error('Collection mappings require a static route.');
  const current = readRouteMap(frontend);
  const record = { route, file: target.file, source, mode, content_type: source === 'cms' ? contentType : null };
  current.mappings = [...current.mappings.filter((item) => item.route !== route), record]
    .sort((a, b) => a.route.localeCompare(b.route));
  fs.mkdirSync(path.dirname(routeMapFile(frontend)), { recursive: true });
  fs.writeFileSync(routeMapFile(frontend), JSON.stringify(current, null, 2) + '\n');
  return record;
}

export function validateRoutes(frontend, root, { requireMap = false } = {}) {
  const routes = inventory(frontend, root);
  const mapExists = fs.existsSync(routeMapFile(frontend));
  const map = readRouteMap(frontend);
  const errors = [];
  const warnings = [];
  const byUrl = new Map();
  for (const route of routes) {
    if (route.parallel || route.intercepted) continue;
    const key = signature(route.url);
    const siblings = byUrl.get(key) || [];
    siblings.push(route);
    byUrl.set(key, siblings);
  }
  for (const [url, items] of byUrl) {
    if (items.length > 1) errors.push(`Ambiguous route ownership for ${url}: ${items.map((item) => item.file).join(', ')}`);
  }
  if (requireMap && !mapExists) errors.push('Route mapping is missing. Run map-route after reviewing routes.');
  const seen = new Set();
  for (const mapping of map.mappings) {
    if (!mapping || typeof mapping.route !== 'string' || seen.has(mapping.route)) {
      errors.push('Duplicate or malformed route mapping.');
      continue;
    }
    seen.add(mapping.route);
    const found = routes.filter((item) => item.url === mapping.route && item.kind === 'page' && !item.parallel && !item.intercepted);
    if (found.length !== 1 || found[0].file !== mapping.file) {
      errors.push(`Stale route mapping for ${mapping.route}: expected ${mapping.file}. Re-map after reviewing the host.`);
      continue;
    }
    const route = found[0];
    if (route.reserved) errors.push(`Protected infrastructure route is mapped: ${mapping.route}`);
    if (!MODES.has(mapping.mode) || !SOURCE.has(mapping.source)) errors.push(`Invalid mapping configuration for ${mapping.route}`);
    if (mapping.mode === 'detail' && route.route_kind === 'static') errors.push(`Detail mapping is not dynamic: ${mapping.route}`);
    if (mapping.mode === 'collection' && route.route_kind !== 'static') errors.push(`Collection mapping is not static: ${mapping.route}`);
    if (mapping.source === 'cms') {
      if (!/^[a-zA-Z0-9_-]+$/.test(mapping.content_type || '')) errors.push(`CMS content type is missing for ${mapping.route}`);
      const expected = mapping.mode === 'collection' ? 'cms-collection' : 'cms-detail';
      if (route.loader !== expected) warnings.push(`CMS loader is not statically verified for ${mapping.route} (${mapping.file}); review host loader and run E2E.`);
    }
  }
  const rootCatchAll = routes.filter((item) => item.kind === 'page' && /^\/\[{1,2}\.\.\./.test(item.url));
  if (rootCatchAll.length > 1) errors.push('Multiple root catch-all routes may conflict.');
  for (const route of routes) {
    if (route.intercepted) warnings.push(`Interception route requires manual ownership review: ${route.file}`);
    if (route.parallel) warnings.push(`Parallel route requires manual ownership review: ${route.file}`);
  }
  return { version: 1, routes, mappings: map.mappings, errors, warnings, checked: mapExists };
}


/** Export an explicit static source snapshot for the authenticated Admin Route Explorer. */
export function exportRouteReport(frontend, root) {
  const report = validateRoutes(frontend, root);
  const filename = path.join(frontend, ".digitalafarin", "routes-report.json");
  const snapshot = {
    version: 1,
    generated_at: new Date().toISOString(),
    routes: report.routes, mappings: report.mappings,
    errors: report.errors, warnings: report.warnings, mapped: report.checked,
    note: "Static source snapshot; mapping intent is not runtime Django integration.",
  };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(snapshot, null, 2) + "\n");
  return { filename, snapshot };
}
