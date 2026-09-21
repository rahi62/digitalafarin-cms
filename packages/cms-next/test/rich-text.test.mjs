import assert from "node:assert/strict";
import test from "node:test";
import { renderCmsRichTextHtml } from "../dist/index.js";

test("rich text renderer escapes text and rejects unsafe URLs", () => {
  const html = renderCmsRichTextHtml({
    format: "tiptap-json",
    version: 1,
    html: "<script>ignored()</script>",
    text: "ignored",
    doc: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "<script>alert(1)</script>" },
            {
              type: "text",
              text: " unsafe",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
            {
              type: "text",
              text: " safe",
              marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank", rel: "nofollow sponsored" } }],
            },
          ],
        },
        { type: "image", attrs: { src: "javascript:alert(1)", alt: "bad" } },
        { type: "image", attrs: { src: "/media/photo.jpg", alt: 'A "photo"' } },
      ],
    },
  });

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /rel="nofollow sponsored noopener noreferrer"/);
  assert.match(html, /src="\/media\/photo\.jpg"/);
  assert.match(html, /alt="A &quot;photo&quot;"/);
  assert.doesNotMatch(html, /<script>/);
});
