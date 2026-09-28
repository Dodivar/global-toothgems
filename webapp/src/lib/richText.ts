/**
 * The small Markdown subset product descriptions are written in.
 *
 * Descriptions stay plain text in the database: an administrator types
 * `**bold**`, `*italic*`, `- item` or `1. item`, and the storefront turns that
 * into structure. Plain text written before this existed reads the same, and
 * the parser returns a tree rather than HTML, so the renderer builds React
 * elements and nothing a customer sees is ever injected as markup.
 *
 * Supported:
 * - a blank line starts a new paragraph, a single line break is kept as is;
 * - `**bold**`, `*italic*` and `_italic_`, nestable;
 * - `- `, `* ` or `• ` bullet lists and `1. ` / `1) ` numbered lists;
 * - `\*` to type a literal marker.
 *
 * A marker without its partner (`5* rating`, a lone `**`) stays literal text.
 */

export type RichInline =
  | { type: "text"; text: string }
  | { type: "strong"; children: RichInline[] }
  | { type: "em"; children: RichInline[] };

export type RichBlock =
  | { type: "paragraph"; lines: RichInline[][] }
  | { type: "list"; ordered: false; items: RichInline[][] }
  | { type: "list"; ordered: true; start: number; items: RichInline[][] };

export const BULLET_PATTERN = /^\s*[-*•]\s+(.*)$/;
export const ORDERED_PATTERN = /^\s*(\d{1,4})[.)]\s+(.*)$/;

export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let current: RichBlock | null = null;

  for (const line of normalizeNewlines(source).split("\n")) {
    if (line.trim() === "") {
      current = null;
      continue;
    }

    const bullet = BULLET_PATTERN.exec(line);
    const ordered = bullet ? null : ORDERED_PATTERN.exec(line);

    if (bullet) {
      if (current?.type !== "list" || current.ordered) {
        current = { type: "list", ordered: false, items: [] };
        blocks.push(current);
      }
      current.items.push(parseInline(bullet[1]));
    } else if (ordered) {
      if (current?.type !== "list" || !current.ordered) {
        current = { type: "list", ordered: true, start: Number(ordered[1]), items: [] };
        blocks.push(current);
      }
      current.items.push(parseInline(ordered[2]));
    } else {
      if (current?.type !== "paragraph") {
        current = { type: "paragraph", lines: [] };
        blocks.push(current);
      }
      current.lines.push(parseInline(line.trim()));
    }
  }

  return blocks;
}

export function parseInline(text: string): RichInline[] {
  const nodes: RichInline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) nodes.push({ type: "text", text: buffer });
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === "\\" && i + 1 < text.length && "*_\\".includes(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (text.startsWith("**", i)) {
      const close = /\s/.test(text[i + 2] ?? " ") ? -1 : findClosing(text, "**", i + 2);
      if (close !== -1) {
        flush();
        nodes.push({ type: "strong", children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
      // An unmatched `**` is literal: keep both stars together so the second
      // one is not mistaken for an italic opener.
      buffer += "**";
      i += 2;
      continue;
    }

    if ((char === "*" || char === "_") && canOpenEmphasis(text, i)) {
      const close = findClosing(text, char, i + 1);
      if (close !== -1) {
        flush();
        nodes.push({ type: "em", children: parseInline(text.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }

  flush();
  return nodes;
}

export function normalizeNewlines(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

function canOpenEmphasis(text: string, index: number): boolean {
  const next = text[index + 1];
  if (next === undefined || /\s/.test(next)) return false;
  // `_` inside a word (`gem_size_2`) is not emphasis.
  if (text[index] === "_" && /[\p{L}\p{N}]/u.test(text[index - 1] ?? "")) return false;
  return true;
}

/**
 * The first marker after `from` that can close an emphasis: not preceded by
 * whitespace, and — for a single `*` — not half of a `**` that belongs to a
 * nested bold run.
 */
function findClosing(text: string, marker: string, from: number): number {
  let index = text.indexOf(marker, from);
  while (index !== -1) {
    // In a run of three or more stars (`*c***`), bold closes on the last two
    // so an italic nested at the end of the bold text closes first.
    if (marker === "**") {
      while (text[index + 2] === "*") index += 1;
    }
    const before = text[index - 1];
    const escaped = before === "\\";
    const valid =
      index > from &&
      !escaped &&
      !/\s/.test(before) &&
      (marker !== "*" || (text[index + 1] !== "*" && before !== "*")) &&
      (marker !== "_" || !/[\p{L}\p{N}]/u.test(text[index + 1] ?? ""));
    if (valid) return index;
    index = text.indexOf(marker, index + (marker === "*" && text[index + 1] === "*" ? 2 : 1));
  }
  return -1;
}
