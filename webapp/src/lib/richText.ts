/**
 * The Markdown subset product descriptions are written in.
 *
 * Descriptions stay plain text in the database. The admin editor shows them
 * formatted and writes this syntax back (see `richTextSerialize.ts`), and the
 * storefront turns it into structure. Plain text written before this existed
 * reads the same, and the parser returns a tree rather than HTML, so the
 * renderer builds React elements and nothing a customer sees is ever injected
 * as markup.
 *
 * Supported:
 * - a blank line starts a new paragraph, a single line break is kept as is;
 * - `## ` and `### ` headings (the product name is the page's h1);
 * - `> ` quotes, and `---` alone on a line for a separator;
 * - `- `, `* ` or `• ` bullet lists and `1. ` / `1) ` numbered lists;
 * - `**bold**`, `*italic*` or `_italic_`, `++underline++`, `~~strikethrough~~`,
 *   all nestable;
 * - `[text](https://…)` links, for `http(s)`, `mailto` and site-relative URLs
 *   only: anything else stays literal text;
 * - a backslash before a marker (`\*`, `\#`, `1\.`) to type it literally.
 *
 * A marker without its partner (`5* rating`, a lone `**`) stays literal text.
 */

export type RichInline =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "underline" | "strike"; children: RichInline[] }
  | { type: "link"; href: string; children: RichInline[] };

export type RichBlock =
  | { type: "paragraph"; lines: RichInline[][] }
  | { type: "heading"; level: 2 | 3; content: RichInline[] }
  | { type: "quote"; lines: RichInline[][] }
  | { type: "rule" }
  | { type: "list"; ordered: false; items: RichInline[][] }
  | { type: "list"; ordered: true; start: number; items: RichInline[][] };

export const BULLET_PATTERN = /^\s*[-*•]\s+(.*)$/;
export const ORDERED_PATTERN = /^\s*(\d{1,4})[.)]\s+(.*)$/;
const HEADING_PATTERN = /^\s*(#{2,3})\s+(.*)$/;
const QUOTE_PATTERN = /^\s*>(?:\s+(.*))?$/;
const RULE_PATTERN = /^\s*-{3,}\s*$/;

/** Characters a backslash turns back into plain text. */
export const ESCAPABLE = "\\*_~+[]#>-.)•";

/** Paired markers, longest first so `**` is tried before `*`. */
const DOUBLE_MARKERS = [
  ["**", "strong"],
  ["++", "underline"],
  ["~~", "strike"],
] as const;

export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let current: RichBlock | null = null;

  for (const line of normalizeNewlines(source).split("\n")) {
    if (line.trim() === "") {
      current = null;
      continue;
    }

    if (RULE_PATTERN.test(line)) {
      blocks.push({ type: "rule" });
      current = null;
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 2 | 3, content: parseInline(heading[2].trim()) });
      current = null;
      continue;
    }

    const quote = QUOTE_PATTERN.exec(line);
    if (quote) {
      if (current?.type !== "quote") {
        current = { type: "quote", lines: [] };
        blocks.push(current);
      }
      current.lines.push(parseInline((quote[1] ?? "").trim()));
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
  scan: while (i < text.length) {
    const char = text[i];

    if (char === "\\" && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (char === "[") {
      const link = readLink(text, i);
      if (link) {
        flush();
        nodes.push({ type: "link", href: link.href, children: parseInline(link.label) });
        i = link.end;
        continue;
      }
    }

    for (const [marker, type] of DOUBLE_MARKERS) {
      if (!text.startsWith(marker, i)) continue;
      const close = /\s/.test(text[i + 2] ?? " ") ? -1 : findClosing(text, marker, i + 2);
      if (close !== -1) {
        flush();
        nodes.push({ type, children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
        continue scan;
      }
      // An unmatched pair is literal: keep both characters together so the
      // second `*` is not mistaken for an italic opener.
      buffer += marker;
      i += 2;
      continue scan;
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

/**
 * Whether a link target is one the storefront may point to: a web page, an
 * e-mail address or a page of the site itself. `javascript:` and `data:` URLs
 * never make it into an `href`, and `//host` (protocol-relative) is refused
 * because it leaves the site while looking like a local path.
 */
export function isSafeHref(href: string): boolean {
  if (/\s/.test(href)) return false;
  return /^(https?:\/\/[^/]|mailto:.+@)/i.test(href) || /^\/(?!\/)/.test(href);
}

/** `[label](href)` starting at `start`, or `null` when it is not a usable link. */
function readLink(text: string, start: number): { label: string; href: string; end: number } | null {
  let depth = 0;
  let i = start;
  for (; i < text.length; i += 1) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text[i] === "[") depth += 1;
    else if (text[i] === "]" && --depth === 0) break;
  }
  if (i >= text.length || text[i + 1] !== "(") return null;
  const hrefEnd = text.indexOf(")", i + 2);
  if (hrefEnd === -1) return null;
  const label = text.slice(start + 1, i);
  const href = text.slice(i + 2, hrefEnd);
  if (!label.trim() || !isSafeHref(href)) return null;
  return { label, href, end: hrefEnd + 1 };
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
  const repeated = marker.length === 2 ? marker[0] : null;
  let index = text.indexOf(marker, from);
  while (index !== -1) {
    // In a run of three or more stars the pair closes where the text inside
    // keeps its single markers paired: on the last two for an italic nested at
    // the end of the bold text (`**b *c***`), on the first two for an italic
    // right after it (`**b***c*`).
    if (repeated) {
      let last = index;
      while (text[last + 2] === repeated) last += 1;
      let pick = last;
      for (let candidate = index; candidate < last; candidate += 1) {
        if (countUnescaped(text.slice(from, candidate), repeated) % 2 === 0) {
          pick = candidate;
          break;
        }
      }
      index = pick;
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

function countUnescaped(text: string, char: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\\") i += 1;
    else if (text[i] === char) count += 1;
  }
  return count;
}
