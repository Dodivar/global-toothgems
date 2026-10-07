/** HTML safety shared by the renderer, the layout and the components. */

export class EmailRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailRenderError";
  }
}

export const HTTPS_VALUE = /^https:\/\/[^\s<>"']+$/;
const MAILTO_VALUE = /^mailto:[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * A link target, escaped for an attribute. Only an https address (or a mailto:
 * for support links) is accepted: a `javascript:` or `http:` value fails the
 * render instead of reaching a customer.
 */
export function safeHref(url: string, what = "link"): string {
  const trimmed = url.trim();
  if (!HTTPS_VALUE.test(trimmed) && !MAILTO_VALUE.test(trimmed)) {
    throw new EmailRenderError(`${what} must be an https address`);
  }
  return escapeHtml(trimmed);
}

/** An image source: https only (no data: URIs — Gmail clips heavy messages and blocks most of them). */
export function safeSrc(url: string): string {
  const trimmed = url.trim();
  if (!HTTPS_VALUE.test(trimmed)) throw new EmailRenderError("image source must be an https address");
  return escapeHtml(trimmed);
}
