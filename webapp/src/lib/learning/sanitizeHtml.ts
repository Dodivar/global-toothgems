/**
 * Allow-list sanitiser for authored lesson text.
 *
 * The builder's text block stores a small HTML subset (headings, paragraphs,
 * lists, emphasis, quotes, links). The learner reads that HTML, so it is
 * treated as untrusted: every tag outside the list is dropped, every attribute
 * is dropped except a link's `href`, and that `href` must be http(s), mailto
 * or a same-site path. Tags are re-emitted from scratch rather than copied, so
 * nothing the author (or anyone who got into the author's account) wrote in an
 * attribute survives. `script`, `style` and similar elements lose their
 * content as well as their tags.
 *
 * String-based on purpose: it runs identically in the browser, in tests and on
 * a server, with no DOM required. The production pipeline should still
 * sanitise on write, server-side; this is the read-side guard.
 */

const ALLOWED = new Set([
  "p", "br", "h2", "h3", "h4", "ul", "ol", "li", "strong", "b", "em", "i", "u", "blockquote", "a",
]);

/** Elements whose content is code or chrome, never lesson text. */
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math", "textarea", "select"];

const VOID = new Set(["br"]);

function escapeText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** An out-of-range entity decodes to nothing rather than throwing. */
function codePoint(value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : "";
}

/** Decodes the few entities that can hide a scheme (`java&#115;cript:`). */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => codePoint(Number(dec)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&amp;/gi, "&");
}

export function safeHref(raw: string): string | null {
  // Browsers ignore whitespace and control characters inside a scheme
  // ("java\tscript:"), so they are removed before the scheme is checked.
  const value = Array.from(decodeEntities(raw))
    .filter((char) => char.charCodeAt(0) > 0x20 && char.charCodeAt(0) !== 0x7f)
    .join("");
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("#")) return value;
  return null;
}

function readHref(attributes: string): string | null {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attributes);
  if (!match) return null;
  return safeHref(match[1] ?? match[2] ?? match[3] ?? "");
}

export function sanitizeHtml(html: string): string {
  let input = html.replace(/<!--[\s\S]*?(-->|$)/g, "");
  for (const tag of DROP_WITH_CONTENT) {
    input = input.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(<\\/${tag}\\s*>|$)`, "gi"), "");
  }

  const out: string[] = [];
  const open: string[] = [];
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(input))) {
    out.push(escapeText(input.slice(cursor, match.index)));
    cursor = match.index + match[0].length;

    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    if (!ALLOWED.has(name)) continue;

    if (closing) {
      // Only close what is open, so stray closers cannot unbalance the page.
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }

    if (VOID.has(name)) {
      out.push(`<${name}>`);
      continue;
    }

    if (name === "a") {
      const href = readHref(match[3]);
      out.push(href ? `<a href="${escapeText(href)}" rel="noopener noreferrer" target="_blank">` : "<a>");
    } else {
      out.push(`<${name}>`);
    }
    open.push(name);
  }

  out.push(escapeText(input.slice(cursor)));
  while (open.length) out.push(`</${open.pop()}>`);
  return out.join("");
}
