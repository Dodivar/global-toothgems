/**
 * Renders a database e-mail template (`email_template_for()`) into a subject,
 * an HTML body in the shared brand layout and a plain-text twin.
 *
 * The templates are plain text with `{{variable}}` placeholders, written by the
 * team in the Translations workspace. Rules:
 *   - every placeholder must be declared by the template (`variables`) AND given
 *     a value by the caller — a missing value fails loudly rather than sending
 *     "Hello ,";
 *   - every value is HTML-escaped; a value is only turned into a link when it is,
 *     as a whole, an https address (a customer's gift message never becomes one);
 *   - the subject is one line, whatever the values contain (no header injection).
 * No React, no template engine: pure functions, tested without I/O.
 */

export interface TemplateRow {
  locale: string;
  subject: string;
  preheader: string | null;
  body: string;
  variables: string[];
  outdated?: boolean;
}

export interface LayoutOptions {
  brandName: string;
  /** Production origin, shown in the footer (e.g. https://globaltoothgems.com). */
  siteUrl: string;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

export class EmailRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailRenderError";
  }
}

const PLACEHOLDER = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;
const HTTPS_VALUE = /^https:\/\/[^\s<>"']+$/;
const HTTPS_IN_TEXT = /https:\/\/[^\s<>"']+/g;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function lookup(name: string, template: TemplateRow, values: Record<string, string>): string {
  if (!template.variables.includes(name)) {
    throw new EmailRenderError(`placeholder {{${name}}} is not declared by the template`);
  }
  const value = values[name];
  if (typeof value !== "string") throw new EmailRenderError(`no value for {{${name}}}`);
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

/** One line of plain text: placeholders replaced, line breaks collapsed. */
function renderLine(source: string, template: TemplateRow, values: Record<string, string>): string {
  return source
    .replace(PLACEHOLDER, (_, name: string) => lookup(name, template, values))
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function linkHtml(address: string): string {
  const safe = escapeHtml(address);
  return `<a href="${safe}" style="color:#3f5a75;text-decoration:underline;">${safe}</a>`;
}

/** Staff-written text: escaped, https addresses linked. */
function literalToHtml(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(HTTPS_IN_TEXT)) {
    // Sentence punctuation after an address is not part of it.
    const address = match[0].replace(/[.,;:!?)]+$/, "");
    const start = match.index!;
    out += escapeHtml(text.slice(last, start));
    out += linkHtml(address);
    last = start + address.length;
  }
  return out + escapeHtml(text.slice(last));
}

/** A caller-provided value: escaped; a link only when the whole value is an https address. */
function valueToHtml(value: string): string {
  const trimmed = value.trim();
  if (HTTPS_VALUE.test(trimmed)) return linkHtml(trimmed);
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function bodyToHtml(template: TemplateRow, values: Record<string, string>): string {
  const source = template.body.replaceAll("\r\n", "\n");
  let html = "";
  let last = 0;
  for (const match of source.matchAll(PLACEHOLDER)) {
    html += literalToHtml(source.slice(last, match.index!));
    html += valueToHtml(lookup(match[1], template, values));
    last = match.index! + match[0].length;
  }
  html += literalToHtml(source.slice(last));
  return html
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) =>
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2b2b;">${paragraph.replaceAll("\n", "<br>")}</p>`
    )
    .join("\n");
}

function bodyToText(template: TemplateRow, values: Record<string, string>): string {
  return template.body
    .replaceAll("\r\n", "\n")
    .replace(PLACEHOLDER, (_, name: string) => lookup(name, template, values))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderEmail(
  template: TemplateRow,
  values: Record<string, string>,
  layout: LayoutOptions,
): RenderedEmail {
  const subject = renderLine(template.subject, template, values);
  if (!subject) throw new EmailRenderError("the subject is empty once rendered");
  const preheader = renderLine(template.preheader ?? "", template, values);
  const content = bodyToHtml(template, values);
  const text = bodyToText(template, values);
  if (!text) throw new EmailRenderError("the body is empty once rendered");

  const brand = escapeHtml(layout.brandName);
  const site = escapeHtml(layout.siteUrl);
  const html = `<!doctype html>
<html lang="${escapeHtml(template.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f2f1ed;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f1ed;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 8px;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#3f5a75;">${brand}</td></tr>
<tr><td style="padding:16px 32px 8px;">
${content}
</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #e4e3df;font-size:12px;line-height:1.5;color:#8a8a8a;">${brand} · <a href="${site}" style="color:#8a8a8a;">${site.replace(/^https?:\/\//, "")}</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, preheader, html, text: `${text}\n\n— ${layout.brandName}\n${layout.siteUrl}\n` };
}
