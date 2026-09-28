import { Fragment, useMemo, type ReactNode } from "react";
import clsx from "clsx";
import { parseRichText, type RichInline } from "../../lib/richText";

/**
 * Renders a description written in the `richText.ts` Markdown subset.
 *
 * A `<div>` rather than a `<p>`: the text can hold several paragraphs and
 * lists. Spacing and list markers come from `.gt-rich-text`, so the caller
 * only sets the typography.
 */
export function RichText({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseRichText(source), [source]);

  return (
    <div className={clsx("gt-rich-text", className)}>
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return (
            <p key={index}>
              {block.lines.map((line, lineIndex) => (
                <Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  {renderInline(line)}
                </Fragment>
              ))}
            </p>
          );
        }
        const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>);
        return block.ordered ? (
          <ol key={index} start={block.start !== 1 ? block.start : undefined}>
            {items}
          </ol>
        ) : (
          <ul key={index}>{items}</ul>
        );
      })}
    </div>
  );
}

function renderInline(nodes: RichInline[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === "text") return <Fragment key={index}>{node.text}</Fragment>;
    if (node.type === "strong") return <strong key={index}>{renderInline(node.children)}</strong>;
    return <em key={index}>{renderInline(node.children)}</em>;
  });
}
