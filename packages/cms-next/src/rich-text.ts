import type { CmsRichTextBlock, CmsRichTextData, CmsRichTextNode } from "./types.js";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function safeUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/") || raw.startsWith("#")) return raw;
  try {
    const url = new URL(raw);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? raw : "";
  } catch {
    return "";
  }
}

function nodeAttrs(node: CmsRichTextNode) {
  const attrs = node.attrs || {};
  const parts: string[] = [];
  const dir = attrs.dir === "rtl" || attrs.dir === "ltr" ? attrs.dir : null;
  const align = ["left", "right", "center", "justify"].includes(String(attrs.textAlign))
    ? String(attrs.textAlign)
    : null;
  if (dir) parts.push(`dir="${dir}"`);
  if (align) parts.push(`style="text-align:${align}"`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function renderMarks(text: string, marks: CmsRichTextNode["marks"]) {
  let html = escapeHtml(text);
  for (const mark of marks || []) {
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "underline":
        html = `<u>${html}</u>`;
        break;
      case "strike":
        html = `<s>${html}</s>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "highlight":
        html = `<mark>${html}</mark>`;
        break;
      case "link": {
        const href = safeUrl(mark.attrs?.href);
        if (!href) break;
        const target = mark.attrs?.target === "_blank" ? "_blank" : "";
        const allowedRel = new Set(["nofollow", "sponsored", "noopener", "noreferrer"]);
        const rel = String(mark.attrs?.rel || "")
          .split(/\s+/)
          .filter((item) => allowedRel.has(item));
        if (target === "_blank") {
          rel.push("noopener", "noreferrer");
        }
        const uniqueRel = [...new Set(rel)];
        html = `<a href="${escapeHtml(href)}"${target ? ' target="_blank"' : ""}${uniqueRel.length ? ` rel="${uniqueRel.join(" ")}"` : ""}>${html}</a>`;
        break;
      }
    }
  }
  return html;
}

function renderChildren(node: CmsRichTextNode) {
  return (node.content || []).map(renderNode).join("");
}

function renderNode(node: CmsRichTextNode): string {
  switch (node.type) {
    case "doc":
      return renderChildren(node);
    case "text":
      return renderMarks(node.text || "", node.marks);
    case "paragraph":
      return `<p${nodeAttrs(node)}>${renderChildren(node)}</p>`;
    case "heading": {
      const raw = Number(node.attrs?.level || 2);
      const level = Math.min(6, Math.max(1, Number.isFinite(raw) ? raw : 2));
      return `<h${level}${nodeAttrs(node)}>${renderChildren(node)}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote>${renderChildren(node)}</blockquote>`;
    case "bulletList":
      return `<ul>${renderChildren(node)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(node)}</li>`;
    case "codeBlock": {
      const language = String(node.attrs?.language || "").replace(/[^a-zA-Z0-9_+-]/g, "");
      return `<pre><code${language ? ` class="language-${language}"` : ""}>${renderChildren(node)}</code></pre>`;
    }
    case "horizontalRule":
      return "<hr>";
    case "hardBreak":
      return "<br>";
    case "image": {
      const src = safeUrl(node.attrs?.src);
      if (!src) return "";
      const alt = escapeHtml(node.attrs?.alt || "");
      const title = node.attrs?.title ? ` title="${escapeHtml(node.attrs.title)}"` : "";
      const width = Number(node.attrs?.width);
      const height = Number(node.attrs?.height);
      const size = [
        Number.isFinite(width) && width > 0 ? ` width="${Math.round(width)}"` : "",
        Number.isFinite(height) && height > 0 ? ` height="${Math.round(height)}"` : "",
      ].join("");
      return `<img src="${escapeHtml(src)}" alt="${alt}"${title}${size}>`;
    }
    case "table":
      return `<table>${renderChildren(node)}</table>`;
    case "tableRow":
      return `<tr>${renderChildren(node)}</tr>`;
    case "tableHeader":
      return `<th>${renderChildren(node)}</th>`;
    case "tableCell":
      return `<td>${renderChildren(node)}</td>`;
    default:
      return renderChildren(node);
  }
}

export function isCmsRichTextBlock(block: { type?: string; data?: unknown }): block is CmsRichTextBlock {
  if (block.type !== "rich_text" || !block.data || typeof block.data !== "object") return false;
  const data = block.data as Partial<CmsRichTextData>;
  return data.format === "tiptap-json" && Boolean(data.doc && typeof data.doc === "object");
}

export function renderCmsRichTextHtml(value: CmsRichTextData | CmsRichTextBlock) {
  const data = "type" in value ? value.data : value;
  return renderNode(data.doc);
}
