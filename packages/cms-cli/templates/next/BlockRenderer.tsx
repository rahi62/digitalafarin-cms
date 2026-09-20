import {
  isCmsRichTextBlock,
  renderCmsRichTextHtml,
  type CmsBlock,
} from "@digitalafarin/cms-next";

export function DigitalAfarinBlockRenderer({ blocks }: { blocks: CmsBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        const data = block.data as Record<string, any>;
        const key = block.id || index;

        switch (block.type) {
          case "rich_text":
            return isCmsRichTextBlock(block) ? (
              <div
                key={key}
                className="cms-rich-text"
                dangerouslySetInnerHTML={{ __html: renderCmsRichTextHtml(block) }}
              />
            ) : null;

          case "heading": {
            const level = Math.min(6, Math.max(2, Number(data.level) || 2));
            const Tag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
            return <Tag key={key}>{data.text}</Tag>;
          }

          case "paragraph":
            return <p key={key}>{data.text}</p>;

          case "image":
            return (
              <figure key={key}>
                <img
                  src={data.src || data.url}
                  alt={data.alt || ""}
                  width={data.width || undefined}
                  height={data.height || undefined}
                />
                {data.caption ? <figcaption>{data.caption}</figcaption> : null}
              </figure>
            );

          case "quote":
            return <blockquote key={key}>{data.text}</blockquote>;

          case "list": {
            const Tag = data.ordered ? "ol" : "ul";
            return (
              <Tag key={key}>
                {(data.items || []).map((item: string, itemIndex: number) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </Tag>
            );
          }

          case "code":
            return (
              <pre key={key}>
                <code>{data.code}</code>
              </pre>
            );

          case "cta":
            return (
              <aside key={key} className="cms-cta">
                {data.title ? <h3>{data.title}</h3> : null}
                {data.text ? <p>{data.text}</p> : null}
                {data.href && data.label ? <a href={data.href}>{data.label}</a> : null}
              </aside>
            );

          case "faq":
            return (
              <section key={key}>
                {(data.items || []).map((item: any, itemIndex: number) => (
                  <details key={itemIndex}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </section>
            );

          case "divider":
            return <hr key={key} />;

          default:
            return null;
        }
      })}
    </>
  );
}
