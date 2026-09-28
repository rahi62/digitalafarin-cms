import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const slash = (p) => p.split(path.sep).join("/");
const hash = (text) => createHash("sha256").update(text).digest("hex");
export function inventory(frontend, root) {
  const routes = [];
  function walk(dir, segments = []) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory() && !item.name.startsWith("_")) walk(path.join(dir, item.name), [...segments, item.name]);
      if (item.isFile() && /^(page|route)\.(tsx?|jsx?)$/.test(item.name)) {
        routes.push({ url: "/" + segments.filter((s) => !s.startsWith("(") && !s.startsWith("@")).join("/"),
          file: slash(path.relative(frontend, path.join(dir, item.name))), kind: item.name.startsWith("page.") ? "page" : "route" });
      }
    }
  }
  walk(path.join(root, "app"));
  return routes;
}

export function scaffoldIntegration(frontend, root, templates, options = {}) {
  const routes = inventory(frontend, root);
  const manifestFile = path.join(frontend, ".digitalafarin/integration.json");
  // Do not discard a pending review when init is run again.
  if (fs.existsSync(manifestFile)) {
    console.log("Existing integration plan retained. Review .digitalafarin/integration.json and run doctor.");
    return;
  }
  const pending = [];
  const created = [];
  const warnings = [];
  const put = (file, text, legacy = false) => {
    const relative = slash(path.relative(frontend, file));
    if (fs.existsSync(file)) {
      const original = fs.readFileSync(file, "utf8");
      if (original === text) return;
      const proposal = `.digitalafarin/proposals/${relative}.txt`;
      fs.mkdirSync(path.dirname(path.join(frontend, proposal)), { recursive: true });
      fs.writeFileSync(path.join(frontend, proposal), text);
      pending.push({ file: relative, proposal, original_sha256: hash(original), legacy });
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      created.push(relative);
    }
  };
  const app = path.join(root, "app");
  if (!fs.existsSync(app)) throw new Error("CMS integration currently requires the Next.js App Router.");
  put(path.join(app, "media/[...path]/route.ts"), 'import { createCmsMediaHandler } from "@digitalafarin/cms-next/server";\nexport const dynamic = "force-dynamic";\nexport const GET = createCmsMediaHandler();\nexport const HEAD = GET;\n');
  put(path.join(app, "digitalafarin-cms-preview/[[...cms_path]]/page.tsx"), fs.readFileSync(path.join(templates, "preview-page.tsx"), "utf8"));
  put(path.join(root, "components/digitalafarin-cms/BlockRenderer.tsx"), fs.readFileSync(path.join(templates, "BlockRenderer.tsx"), "utf8"));
  const configs = ["next.config.ts", "next.config.mjs", "next.config.js"].filter((name) => fs.existsSync(path.join(frontend, name)));
  if (!configs.length) {
    put(path.join(frontend, "next.config.mjs"), 'import { withDigitalAfarinCms } from "@digitalafarin/cms-next/config";\nexport default withDigitalAfarinCms({});\n');
  } else if (!fs.readFileSync(path.join(frontend, configs[0]), "utf8").includes("withDigitalAfarinCms")) {
    warnings.push(`Wrap the exported config in ${configs[0]} with withDigitalAfarinCms from @digitalafarin/cms-next/config. Preserve host config, redirects and middleware; review preview/media exclusions.`);
  }
  if (["middleware.ts", "middleware.js", "proxy.ts", "proxy.js"].some((file) => fs.existsSync(path.join(root, file)))) {
    warnings.push("Host middleware/proxy runs before preview rewrites: preserve authentication, but review redirects for cms_preview and media requests.");
  }
  if (options.collection) {
    const collection = options.collectionPath || "/blog";
    const kind = options.contentType || "post";
    if (!/^\/(?:[\p{L}\p{N}_-]+\/?)+$/u.test(collection) || !/^[a-zA-Z0-9_-]+$/.test(kind)) throw new Error("Invalid collection path or content type slug.");
    const base = collection.replace(/\/$/, "");
    for (const detail of [false, true]) {
      const matching = routes.filter((r) => r.kind === "page" && (detail ? r.url.startsWith(base + "/[") && r.url.split("/").length === base.split("/").length + 1 : r.url === base));
      if (matching.length > 1 || matching.some((r) => r.url.includes("..."))) {
        warnings.push(`Complex route ownership for ${base}; integrate cms.listEntries/cms.resolveForRoute manually.`);
        continue;
      }
      const file = matching[0] ? path.join(frontend, matching[0].file) : path.join(app, base.slice(1), ...(detail ? ["[slug]"] : []), "page.tsx");
      let text = fs.readFileSync(path.join(templates, detail ? "detail-page.tsx" : "collection-page.tsx"), "utf8");
      const modulePath = (target) => {
        const rel = slash(path.relative(path.dirname(file), path.join(root, target)));
        return rel.startsWith(".") ? rel : "./" + rel;
      };
      text = text.replaceAll("__CMS_LIB__", modulePath("lib/digitalafarin-cms"))
        .replaceAll("__CMS_RENDERER__", modulePath("components/digitalafarin-cms/BlockRenderer"))
        .replaceAll("__CMS_COLLECTION__", base).replaceAll("__CMS_TYPE__", kind);
      if (detail && matching[0]) {
        const parameter = matching[0].url.match(/\[([^\]]+)\]$/)?.[1] || "slug";
        text = text.replace("{ slug: string }", `{ ${parameter}: string }`).replace("const { slug }", `const { ${parameter}: slug }`);
      }
      if (fs.existsSync(file)) {
        const ext = path.extname(file);
        const legacyFile = path.join(path.dirname(file), `cms-legacy-page${ext}`);
        if (fs.existsSync(legacyFile)) throw new Error(`Legacy backup already exists: ${legacyFile}. Review it manually.`);
        text = 'import * as LegacyPage from "./cms-legacy-page";\nconst legacy = LegacyPage as any;\n' + text;
        if (detail) {
          text = text.replace("  notFound();", "  return null;")
            .replace("return toNextMetadata(await resolve(props));", "const page = await resolve(props);\n  return page ? toNextMetadata(page) : legacy.generateMetadata ? legacy.generateMetadata(props) : legacy.metadata || {};")
            .replace('  return <main><h1>{page.content.title}', '  if (!page) return <legacy.default {...props} />;\n  return <main><h1>{page.content.title}');
        } else {
          text = text.replace("category?: string }>", "category?: string; cms_source?: string }>")
            .replace("  const pageNumber", '  if (query.cms_source === "legacy") return <legacy.default searchParams={searchParams} />;\n  const pageNumber');
        }
      }
      if (/\.jsx?$/.test(file)) {
        text = text.replace(/^type Props = .*;\r?\n/m, "")
          .replaceAll("props: Props", "props").replaceAll(" as any", "")
          .replace(/: \{ searchParams: Promise<\{[^}]+\}> \}/g, "")
          .replaceAll("page: number", "page");
      }
      put(file, text, fs.existsSync(file));
    }
  } else if (routes.some((r) => r.url === "/blog" || r.url.startsWith("/blog/["))) {
    warnings.push("Existing blog routes still use their original loader. Re-run on a reviewed plan with --with-collection, or integrate listEntries/resolveForRoute explicitly.");
  }
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(manifestFile, JSON.stringify({ status: pending.length || warnings.length ? "review-required" : "verification-required", routes, pending, created, warnings }, null, 2) + "\n");
  fs.writeFileSync(path.join(frontend, ".digitalafarin/INTEGRATION.md"), `# CMS integration review\n\nInspect integration.json and proposals before running digitalafarin-cms apply-integration.\nOriginal pages are copied beside the route as cms-legacy-page before applying reviewed collection adapters. CMS detail wins; legacy detail is used only for a public 404. Preview never falls back. CMS is the sole paginated collection; the unchanged legacy list remains at ?cms_source=legacy. No arrays are merged or counts guessed.\n\nSet DIGITALAFARIN_CMS_MEDIA_UPSTREAM to the fixed storage media base (including /media/ or its actual prefix). API URL is independent. Configure Django DIGITALAFARIN_CMS_MEDIA_PUBLIC_URL for CDN or same-origin /media/.\n\n${warnings.map((w) => "- " + w).join("\n")}\n\nVerify draft preview, publish/list/detail, missing media 404 and host fallback before marking your deployment complete.\n`);
}

export function applyIntegration(frontend) {
  const manifestFile = path.join(frontend, ".digitalafarin/integration.json");
  const plan = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const safe = (relative) => {
    const target = path.resolve(frontend, relative);
    if (!target.startsWith(path.resolve(frontend) + path.sep)) throw new Error("Integration path escapes frontend.");
    return target;
  };
  for (const change of plan.pending) {
    if (hash(fs.readFileSync(safe(change.file), "utf8")) !== change.original_sha256) throw new Error(`Host file changed since review: ${change.file}`);
    if (!fs.existsSync(safe(change.proposal))) throw new Error(`Missing proposal: ${change.proposal}`);
    const backup = change.legacy ? path.join(path.dirname(safe(change.file)), `cms-legacy-page${path.extname(change.file)}`) : safe(`.digitalafarin/backups/${change.file}`);
    if (fs.existsSync(backup)) throw new Error(`Backup already exists: ${backup}`);
  }
  for (const change of plan.pending) {
    const file = safe(change.file);
    const backup = change.legacy ? path.join(path.dirname(file), `cms-legacy-page${path.extname(file)}`) : safe(`.digitalafarin/backups/${change.file}`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(safe(change.proposal), file);
  }
  plan.applied = plan.pending;
  plan.pending = [];
  plan.status = "verification-required";
  fs.writeFileSync(manifestFile, JSON.stringify(plan, null, 2) + "\n");
  console.log("Reviewed adapters applied with backups. Run doctor and the host integration acceptance tests.");
}

export function frontendDoctor(frontend, root) {
  let issues = 0;
  const file = path.join(frontend, ".digitalafarin/integration.json");
  if (!fs.existsSync(file)) { console.log("Integration plan missing: existing routes/media/preview require review."); return 1; }
  const plan = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const pending of plan.pending) { console.log(`Review required: ${pending.file} -> ${pending.proposal}`); issues++; }
  for (const warning of plan.warnings) { console.log(`Review: ${warning}`); }
  const config = ["next.config.ts", "next.config.mjs", "next.config.js"].map((name) => path.join(frontend, name)).find(fs.existsSync);
  if (!config || !fs.readFileSync(config, "utf8").includes("withDigitalAfarinCms")) { console.log("Preview config composition is pending."); issues++; }
  const envFile = path.join(frontend, ".env.local");
  const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  if (!process.env.DIGITALAFARIN_CMS_MEDIA_UPSTREAM && !/^DIGITALAFARIN_CMS_MEDIA_UPSTREAM=\S+/m.test(env)) { console.log("Set DIGITALAFARIN_CMS_MEDIA_UPSTREAM for same-origin media."); issues++; }
  console.log("Static checks cannot certify runtime integration. Test preview on / and existing routes, publication and media 404s.");
  return issues;
}
