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
 * The page around the body is the master layout (`layout.ts`) and its
 * components (`components.ts`); see `preview.ts` to look at it.
 * No React, no template engine: pure functions, tested without I/O.
 */
import { actions, type Block, eyebrow, intro, type Link, paragraphStyle, title } from "./components.ts";
import { EmailRenderError, escapeHtml, HTTPS_VALUE } from "./html.ts";
import { emailDocument, type LayoutOptions } from "./layout.ts";
import { color } from "./tokens.ts";

export { EmailRenderError, escapeHtml } from "./html.ts";
export type { LayoutOptions } from "./layout.ts";

export interface TemplateRow {
  locale: string;
  subject: string;
  preheader: string | null;
  body: string;
  variables: string[];
  outdated?: boolean;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

/**
 * What the calling code adds around the staff-written body, built from the
 * components (never from substituted values, so a customer's text cannot become
 * a button). Order in the card: eyebrow, title, intro, body, actions, blocks.
 */
export interface EmailContent {
  eyebrow?: string;
  /** The `<h1>`. Defaults to the rendered subject; `null` leaves the e-mail without one. */
  title?: string | null;
  intro?: string;
  primaryAction?: Link;
  secondaryAction?: Link;
  /** Order summary, course card, notices… placed after the body and the actions. */
  blocks?: Block[];
  /** Marketing e-mails only. */
  unsubscribeUrl?: string;
}

const PLACEHOLDER = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g;
const HTTPS_IN_TEXT = /https:\/\/[^\s<>"']+/g;

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
  return `<a href="${safe}" style="color:${color.ink};text-decoration:underline;font-weight:600;word-break:break-all;">${safe}</a>`;
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
      `<p style="${paragraphStyle}">${paragraph.replaceAll("\n", "<br>")}</p>`
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
  content: EmailContent = {},
): RenderedEmail {
  const subject = renderLine(template.subject, template, values);
  if (!subject) throw new EmailRenderError("the subject is empty once rendered");
  const preheader = renderLine(template.preheader ?? "", template, values);
  const bodyHtml = bodyToHtml(template, values);
  const bodyText = bodyToText(template, values);
  if (!bodyText) throw new EmailRenderError("the body is empty once rendered");

  const heading = content.title === undefined ? subject : content.title;
  const blocks: Block[] = [
    ...(content.eyebrow ? [eyebrow(content.eyebrow)] : []),
    ...(heading ? [title(heading)] : []),
    ...(content.intro ? [intro(content.intro)] : []),
    { html: `<div style="margin:16px 0 0;">${bodyHtml}</div>`, text: bodyText },
    ...(content.primaryAction || content.secondaryAction
      ? [actions(content.primaryAction ?? null, content.secondaryAction ?? null)]
      : []),
    ...(content.blocks ?? []),
  ];
  const { html, text } = emailDocument(
    { locale: template.locale, subject, preheader, blocks, unsubscribeUrl: content.unsubscribeUrl },
    layout,
  );
  return { subject, preheader, html, text };
}
