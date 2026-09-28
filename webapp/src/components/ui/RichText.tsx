import { Fragment, useMemo, type ReactNode } from "react";
import clsx from "clsx";
import { parseRichText, type RichInline } from "../../lib/richText";

/**
 * Renders a description written in the `richText.ts` Markdown subset.
 *
 * A `<div>` rather than a `<p>`: the text can hold several paragraphs, lists
 * and headings. Spacing and list markers come from `.gt-rich-text`, so the
 * caller only sets the typography.
 */
export function RichText({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseRichText(source), [source]);

  return (
    <div className={clsx("gt-rich-text", className)}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return <p key={index}>{renderLines(block.lines)}</p>;
          case "quote":
            return <blockquote key={index}>{renderLines(block.lines)}</blockquote>;
          case "heading":
            return block.level === 2 ? (
              <h2 key={index}>{renderInline(block.content)}</h2>
            ) : (
              <h3 key={index}>{renderInline(block.content)}</h3>
            );
          case "rule":
            return <hr key={index} />;
          case "list": {
            const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>);
            return block.ordered ? (
              <ol key={index} start={block.start !== 1 ? block.start : undefined}>
                {items}
              </ol>
            ) : (
              <ul key={index}>{items}</ul>
            );
          }
        }
      })}
    </div>
  );
}

function renderLines(lines: RichInline[][]): ReactNode {
  return lines.map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {lineIndex > 0 && <br />}
      {renderInline(line)}
    </Fragment>
  ));
}

function renderInline(nodes: RichInline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "strong":
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case "em":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "underline":
        return <u key={index}>{renderInline(node.children)}</u>;
      case "strike":
        return <s key={index}>{renderInline(node.children)}</s>;
      case "link": {
        // `isSafeHref` already vetted the target in the parser. Links leaving
        // the site open in a new tab so the customer keeps the product page.
        const external = /^https?:/i.test(node.href);
        return (
          <a
            key={index}
            href={node.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {renderInline(node.children)}
          </a>
        );
      }
    }
  });
}
