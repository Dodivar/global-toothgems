import { isSafeHref, type RichBlock, type RichInline } from "./richText";

/**
 * The two directions between the description editor and the stored text.
 *
 * The admin edits a formatted surface (`contentEditable`), but the database
 * keeps the Markdown subset of `richText.ts`. So the editor is seeded from the
 * parsed tree (`fillEditor`), and on every change its DOM is read back into
 * the same tree (`readEditorBlocks`) and written out as Markdown
 * (`serializeRichText`). Only the structure the storefront can render
 * survives the trip: pasted styles, colours and fonts are dropped rather than
 * shown in the editor and lost on the shop.
 */

/**
 * The part of the DOM the reader needs. A real `Node` satisfies it; the tests
 * build plain objects, since the test runner has no DOM.
 */
export interface EditorNode {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<EditorNode>;
  getAttribute?(name: string): string | null;
}

type Formatting = Exclude<RichInline["type"], "text" | "link">;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const BLOCK_ELEMENTS = new Set([
  "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "HR", "PRE",
  "SECTION", "ARTICLE", "HEADER", "FOOTER", "TABLE", "TR",
]);

/** Elements whose content is never text the administrator meant to paste. */
const SKIPPED_ELEMENTS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "SVG", "HEAD", "TITLE", "META", "LINK"]);

const FORMATTING_TAGS: Record<string, Formatting> = {
  B: "strong",
  STRONG: "strong",
  I: "em",
  EM: "em",
  U: "underline",
  INS: "underline",
  S: "strike",
  STRIKE: "strike",
  DEL: "strike",
};

const MARKERS: Record<Formatting, string> = {
  strong: "**",
  em: "*",
  underline: "++",
  strike: "~~",
};

// ---------------------------------------------------------------------------
// Tree → Markdown

export function serializeRichText(blocks: RichBlock[]): string {
  const out: string[] = [];
  for (const block of blocks) {
    const text = serializeBlock(block);
    if (text) out.push(text);
  }
  return out.join("\n\n");
}

function serializeBlock(block: RichBlock): string {
  switch (block.type) {
    case "rule":
      return "---";
    case "heading": {
      const content = serializeInline(block.content).trim();
      return content ? `${"#".repeat(block.level)} ${content}` : "";
    }
    case "quote":
      return nonEmptyLines(block.lines)
        .map((line) => `> ${line}`)
        .join("\n");
    case "paragraph":
      return nonEmptyLines(block.lines).map(escapeLineStart).join("\n");
    case "list":
      return nonEmptyLines(block.items)
        .map((item, index) => `${block.ordered ? `${block.start + index}.` : "-"} ${item}`)
        .join("\n");
  }
}

function nonEmptyLines(lines: RichInline[][]): string[] {
  return lines.map((line) => serializeInline(line).trim()).filter(Boolean);
}

export function serializeInline(nodes: RichInline[]): string {
  const list = normalizeInline(nodes);
  let out = "";
  list.forEach((node, index) => {
    out += serializeNode(node, out.at(-1), firstChar(list[index + 1]));
  });
  return out;
}

function serializeNode(node: RichInline, before: string | undefined, after: string | undefined): string {
  if (node.type === "text") return escapeText(node.text);

  const inner = serializeInline(node.children);
  const core = inner.trim();
  if (!core) return inner;
  const lead = inner.slice(0, inner.length - inner.trimStart().length);
  const trail = inner.slice(inner.trimEnd().length);

  if (node.type === "link") return `${lead}[${core}](${encodeHref(node.href)})${trail}`;

  // Italic prefers `_`, which never merges with the stars of a neighbouring
  // bold run (`***a** b*` is ambiguous, `_**a** b_` is not); `*` is kept for
  // italic inside a word, where `_` does not count as emphasis.
  let marker = MARKERS[node.type];
  if (node.type === "em") {
    const left = lead ? " " : before;
    const right = trail ? " " : after;
    if (!isWordChar(left) && !isWordChar(right)) marker = "_";
  }
  return `${lead}${marker}${core}${marker}${trail}`;
}

/**
 * Merges what the browser splits (two adjacent `<b>`, bold inside bold) so
 * the output carries one marker pair per run, and drops formatting around
 * nothing but spaces.
 */
function normalizeInline(nodes: RichInline[], inside: ReadonlySet<string> = new Set()): RichInline[] {
  const out: RichInline[] = [];
  const push = (node: RichInline) => {
    const last = out.at(-1);
    if (node.type === "text" && last?.type === "text") {
      last.text += node.text;
    } else if (node.type !== "text" && last?.type === node.type && (node.type !== "link" || (last.type === "link" && last.href === node.href))) {
      last.children = normalizeInline([...last.children, ...node.children], inside);
    } else {
      out.push(node.type === "text" ? { ...node } : node);
    }
  };

  for (const node of nodes) {
    if (node.type === "text") {
      if (node.text) push(node);
      continue;
    }
    if (inside.has(node.type)) {
      normalizeInline(node.children, inside).forEach(push);
      continue;
    }
    const children = normalizeInline(node.children, new Set([...inside, node.type]));
    if (children.every((child) => child.type === "text" && !child.text.trim())) {
      children.forEach(push);
      continue;
    }
    push({ ...node, children });
  }
  return out;
}

function firstChar(node: RichInline | undefined): string | undefined {
  if (!node) return undefined;
  // A formatted neighbour starts with its marker, never a letter.
  return node.type === "text" ? node.text[0] : "*";
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

/** Every character the parser could read as a marker gets a backslash. */
function escapeText(text: string): string {
  return text.replace(/[\\*_~+[\]]/g, "\\$&");
}

/**
 * A paragraph line that happens to start like a block (`- `, `1. `, `## `,
 * `> `, `---`) is escaped so it stays a sentence.
 */
function escapeLineStart(line: string): string {
  if (/^(#{2,3}|>|[-•])(\s|$)/.test(line) || /^-{3,}\s*$/.test(line)) return `\\${line}`;
  return line.replace(/^(\d{1,4})([.)])(?=\s)/, "$1\\$2");
}

function encodeHref(href: string): string {
  // `encodeURIComponent` leaves parentheses alone.
  return href.replace(/[()\s]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

// ---------------------------------------------------------------------------
// Editor DOM → tree

export function readEditorBlocks(root: EditorNode): RichBlock[] {
  const blocks: RichBlock[] = [];
  readContainer(root, blocks);
  return blocks;
}

function readContainer(node: EditorNode, out: RichBlock[]): void {
  let loose: EditorNode[] = [];
  const flush = () => {
    if (loose.length) out.push({ type: "paragraph", lines: readLines(loose) });
    loose = [];
  };
  for (const child of Array.from(node.childNodes)) {
    if (isSkipped(child)) continue;
    if (isBlock(child)) {
      flush();
      readBlock(child, out);
    } else {
      loose.push(child);
    }
  }
  flush();
}

function readBlock(element: EditorNode, out: RichBlock[]): void {
  const children = Array.from(element.childNodes);
  switch (element.nodeName) {
    case "HR":
      out.push({ type: "rule" });
      return;
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      out.push({ type: "heading", level: element.nodeName <= "H2" ? 2 : 3, content: joinLines(readLines(children)) });
      return;
    case "UL":
    case "OL": {
      const start = Number.parseInt(element.getAttribute?.("start") ?? "", 10);
      const items = readListItems(children);
      out.push(
        element.nodeName === "OL"
          ? { type: "list", ordered: true, start: Number.isFinite(start) && start > 0 ? start : 1, items }
          : { type: "list", ordered: false, items },
      );
      return;
    }
    case "BLOCKQUOTE": {
      const inner: RichBlock[] = [];
      readContainer(element, inner);
      out.push({ type: "quote", lines: inner.flatMap(blockLines) });
      return;
    }
    default:
      if (children.some(isBlock)) readContainer(element, out);
      else out.push({ type: "paragraph", lines: readLines(children) });
  }
}

/** List items, with nested lists flattened into the list that holds them. */
function readListItems(children: EditorNode[]): RichInline[][] {
  const items: RichInline[][] = [];
  for (const child of children) {
    const parts = child.nodeName === "LI" ? Array.from(child.childNodes) : [child];
    const own = parts.filter((part) => part.nodeName !== "UL" && part.nodeName !== "OL");
    items.push(joinLines(readLines(own)));
    for (const nested of parts) {
      if (nested.nodeName === "UL" || nested.nodeName === "OL") items.push(...readListItems(Array.from(nested.childNodes)));
    }
  }
  return items;
}

function blockLines(block: RichBlock): RichInline[][] {
  switch (block.type) {
    case "rule":
      return [];
    case "heading":
      return [block.content];
    case "list":
      return block.items;
    default:
      return block.lines;
  }
}

/** Inline content split on `<br>` and on any block nested inside it. */
function readLines(nodes: EditorNode[]): RichInline[][] {
  const lines: RichInline[][] = [[]];
  for (const node of nodes) {
    if (node.nodeType === TEXT_NODE) {
      const text = (node.nodeValue ?? "").replace(/[\s ]+/g, " ");
      if (text) lines[lines.length - 1].push({ type: "text", text });
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE || isSkipped(node)) continue;
    if (node.nodeName === "BR") {
      lines.push([]);
      continue;
    }

    const inner = readLines(Array.from(node.childNodes));
    const wrap = inlineWrapper(node);
    const block = isBlock(node);
    if (block && lines[lines.length - 1].length) lines.push([]);
    inner.forEach((line, index) => {
      if (index > 0) lines.push([]);
      lines[lines.length - 1].push(...(wrap && line.length ? wrap(line) : line));
    });
    if (block) lines.push([]);
  }
  return lines;
}

/**
 * What an inline element contributes: a tag (`<b>`, `<a>`), or a `style` the
 * browser writes when it merges two lines of different formatting.
 */
function inlineWrapper(element: EditorNode): ((children: RichInline[]) => RichInline[]) | null {
  const layers: Formatting[] = [];
  const tag = FORMATTING_TAGS[element.nodeName];
  if (tag) layers.push(tag);

  const style = (element.getAttribute?.("style") ?? "").toLowerCase();
  if (/font-weight:\s*(bold|[6-9]00)/.test(style)) layers.push("strong");
  if (/font-style:\s*italic/.test(style)) layers.push("em");
  if (/text-decoration[^;]*underline/.test(style)) layers.push("underline");
  if (/text-decoration[^;]*line-through/.test(style)) layers.push("strike");

  const href = element.nodeName === "A" ? element.getAttribute?.("href")?.trim() : undefined;
  const link = href && isSafeHref(href) ? href : null;

  if (!layers.length && !link) return null;
  return (children) => {
    let wrapped = children;
    for (const type of layers) wrapped = [{ type, children: wrapped }];
    if (link) wrapped = [{ type: "link", href: link, children: wrapped }];
    return wrapped;
  };
}

function joinLines(lines: RichInline[][]): RichInline[] {
  return lines.filter((line) => line.length).flatMap((line, index) => (index > 0 ? [{ type: "text" as const, text: " " }, ...line] : line));
}

function isSkipped(node: EditorNode): boolean {
  return node.nodeType === ELEMENT_NODE && SKIPPED_ELEMENTS.has(node.nodeName.toUpperCase());
}

function isBlock(node: EditorNode): boolean {
  return node.nodeType === ELEMENT_NODE && BLOCK_ELEMENTS.has(node.nodeName);
}

// ---------------------------------------------------------------------------
// Tree → editor DOM

/**
 * Replaces the editor's content with the given blocks. Elements are created
 * one by one, never from an HTML string, so stored text cannot turn into
 * markup. The tags are the ones the browser's own commands produce (`<b>`,
 * `<i>`, `<strike>`), so toggling a style off works on seeded text too.
 */
export function fillEditor(root: HTMLElement, blocks: RichBlock[]): void {
  const doc = root.ownerDocument;
  const el = (tag: string, children: Node[] = []) => {
    const element = doc.createElement(tag);
    element.append(...children);
    return element;
  };
  const inline = (nodes: RichInline[]): Node[] =>
    nodes.map((node) => {
      if (node.type === "text") return doc.createTextNode(node.text);
      if (node.type === "link") {
        const anchor = el("a", inline(node.children));
        anchor.setAttribute("href", node.href);
        return anchor;
      }
      const tag = { strong: "b", em: "i", underline: "u", strike: "strike" }[node.type];
      return el(tag, inline(node.children));
    });
  const lines = (list: RichInline[][]): Node[] =>
    list.flatMap((line, index) => (index > 0 ? [el("br"), ...inline(line)] : inline(line)));

  const nodes: Node[] = blocks.map((block) => {
    switch (block.type) {
      case "rule":
        return el("hr");
      case "heading":
        return el(`h${block.level}`, inline(block.content));
      case "quote":
        return el("blockquote", lines(block.lines));
      case "paragraph":
        return el("p", lines(block.lines));
      case "list": {
        const list = el(block.ordered ? "ol" : "ul", block.items.map((item) => el("li", inline(item))));
        if (block.ordered && block.start !== 1) list.setAttribute("start", String(block.start));
        return list;
      }
    }
  });

  // Typing needs a paragraph to land in: at the very start of an empty
  // editor, and after a separator, which the caret cannot be placed past.
  const last = blocks.at(-1);
  if (!last || last.type === "rule") nodes.push(el("p", [el("br")]));
  root.replaceChildren(...nodes);
}
