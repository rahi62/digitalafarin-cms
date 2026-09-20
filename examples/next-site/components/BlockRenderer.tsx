import type { CmsBlock } from "@digitalafarin/cms-next";

export function BlockRenderer({ blocks }: { blocks: CmsBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        const data = block.data as Record<string, any>;
        const key = block.id || index;

        switch (block.type) {
          case "rich_text":
            return (
              <div
                key={key}
                className="cms-rich-text"
                dangerouslySetInnerHTML={{ __html: typeof data.html === "string" ? data.html : "" }}
              />
            );

          case "hero":
            return (
              <section key={key} style={{ padding: "60px 0" }}>
                <h1>{data.title}</h1>
                <p>{data.subtitle}</p>
              </section>
            );

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
                  style={{ maxWidth: "100%", height: "auto" }}
                />
                {data.caption ? <figcaption>{data.caption}</figcaption> : null}
              </figure>
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

          default:
            return null;
        }
      })}
    </>
  );
}
