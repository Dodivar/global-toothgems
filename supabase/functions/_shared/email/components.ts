/**
 * The building blocks of every Global Toothgems e-mail.
 *
 * Each component takes plain data and returns a `Block`: e-mail-safe HTML
 * (tables, inline styles, no CSS the clients drop) and its plain-text twin, so
 * the text part of a message never lags behind its HTML. Rules:
 *   - every string is HTML-escaped here; callers never write markup;
 *   - links and images must be https (see `html.ts`), anything else fails the render;
 *   - amounts arrive already formatted (`formatAmount()`): no money arithmetic here;
 *   - a state is always named in words (title, label, glyph), never by colour alone.
 * The layout (`layout.ts`) stacks the blocks inside the card with a steady rhythm.
 */
import { escapeHtml, safeHref, safeSrc } from "./html.ts";
import { color, fontStack, type Tone, tone } from "./tokens.ts";

export interface Block {
  html: string;
  text: string;
}

export interface Link {
  label: string;
  url: string;
}

const font = `font-family:${fontStack};`;
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

function lines(...parts: (string | undefined | false)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join("\n");
}

/** Escaped text with the caller's line breaks kept. */
function textHtml(value: string): string {
  return escapeHtml(value.replaceAll("\r\n", "\n").trim()).replaceAll("\n", "<br>");
}

// ---------------------------------------------------------------- Typography

export const paragraphStyle = `margin:0 0 16px;${font}font-size:16px;line-height:1.65;color:${color.body};`;

export function eyebrow(label: string, accent: "brand" | "promo" = "brand"): Block {
  const ink = accent === "promo" ? color.fuchsiaInk : color.blueInk;
  const wash = accent === "promo" ? color.white : color.blueWash;
  return {
    html: `<table ${TABLE} style="margin:0 0 18px;"><tr><td style="background:${wash};border-radius:999px;padding:6px 14px;${font}font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${ink};">${escapeHtml(label)}</td></tr></table>`,
    text: label.toUpperCase(),
  };
}

/** The e-mail's one `<h1>`: what this message is about, in a few words. */
export function title(value: string): Block {
  return {
    html: `<h1 class="gt-h1" style="margin:0 0 16px;${font}font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-0.01em;color:${color.ink};">${textHtml(value)}</h1>`,
    text: value.trim(),
  };
}

/** The lead paragraph under the title: a touch larger than body copy. */
export function intro(value: string): Block {
  return {
    html: `<p style="margin:0 0 8px;${font}font-size:17px;line-height:1.65;color:${color.body};">${textHtml(value)}</p>`,
    text: value.trim(),
  };
}

export function heading(value: string): Block {
  return {
    html: `<h2 style="margin:8px 0 12px;${font}font-size:20px;line-height:1.3;font-weight:700;color:${color.ink};">${textHtml(value)}</h2>`,
    text: value.trim().toUpperCase(),
  };
}

export function paragraph(value: string): Block {
  return { html: `<p style="${paragraphStyle}">${textHtml(value)}</p>`, text: value.trim() };
}

/** Editorial accent (the site's `.gt-accent`): Montserrat italic, never a script face, never for instructions. */
export function accentLine(value: string): Block {
  return {
    html: `<p style="margin:0 0 16px;${font}font-size:18px;line-height:1.5;font-style:italic;color:${color.blueInk};">${textHtml(value)}</p>`,
    text: value.trim(),
  };
}

/** An inline link inside running text: always underlined, never colour alone. */
export function linkHtml(link: Link): string {
  return `<a href="${safeHref(link.url)}" style="color:${color.ink};text-decoration:underline;font-weight:600;">${escapeHtml(link.label)}</a>`;
}

/** A standalone link line ("See the order →"). */
export function textLink(link: Link): Block {
  return {
    html: `<p style="margin:0 0 16px;${font}font-size:15px;line-height:1.5;">${linkHtml(link)}&nbsp;<span aria-hidden="true" style="color:${color.ink};">&rarr;</span></p>`,
    text: `${link.label}: ${link.url.trim()}`,
  };
}

// ---------------------------------------------------------------- Actions

function buttonTable(link: Link, variant: "primary" | "secondary"): string {
  const primary = variant === "primary";
  const fill = primary ? color.emerald : color.white;
  const border = primary ? color.emerald : color.ink;
  // Bulletproof button: the cell carries the colour (Outlook ignores padding on <a>),
  // the link carries the padding so the whole pill is clickable elsewhere. 52px tall.
  return `<table ${TABLE} class="gt-btn" style="border-collapse:separate;"><tr><td align="center" bgcolor="${fill}" style="background:${fill};border:2px solid ${border};border-radius:999px;mso-padding-alt:14px 26px;"><a href="${safeHref(link.url, "button")}" class="gt-btn-a" style="display:inline-block;padding:14px 26px;${font}font-size:16px;line-height:20px;font-weight:700;letter-spacing:0.01em;color:${color.ink};text-decoration:none;border-radius:999px;">${escapeHtml(link.label)}</a></td></tr></table>`;
}

/**
 * The call to action of the e-mail: one emerald primary button, optionally an
 * outlined secondary one. Side by side on a desktop, full width and stacked on a phone.
 */
export function actions(primary: Link | null, secondary?: Link | null): Block {
  const buttons = [
    primary ? buttonTable(primary, "primary") : null,
    secondary ? buttonTable(secondary, "secondary") : null,
  ].filter((b): b is string => b !== null);
  const html = buttons
    .map((b, i) =>
      `<div class="gt-btn-wrap" style="display:inline-block;vertical-align:top;margin:0 ${i < buttons.length - 1 ? 10 : 0}px 12px 0;">${b}</div>`
    )
    .join("");
  return {
    html: `<div style="margin:8px 0 12px;">${html}</div>`,
    text: lines(
      primary ? `${primary.label}: ${primary.url.trim()}` : undefined,
      secondary ? `${secondary.label}: ${secondary.url.trim()}` : undefined,
    ),
  };
}

// ---------------------------------------------------------------- Status

/** A small pill naming a state ("Payée", "En préparation"); the label is the information. */
export function badgeHtml(label: string, kind: Tone = "neutral"): string {
  const t = tone[kind];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${t.wash};${font}font-size:12px;line-height:16px;font-weight:600;color:${t.ink};white-space:nowrap;">${escapeHtml(label)}</span>`;
}

export interface NoticeOptions {
  tone: Exclude<Tone, "neutral">;
  title: string;
  body?: string;
  link?: Link;
}

/** Information, success, warning or important message: tinted box, glyph, title in words. */
export function notice(options: NoticeOptions): Block {
  const t = tone[options.tone];
  const body = options.body
    ? `<p style="margin:4px 0 0;${font}font-size:15px;line-height:1.6;color:${color.body};">${textHtml(options.body)}</p>`
    : "";
  const link = options.link
    ? `<p style="margin:8px 0 0;${font}font-size:15px;line-height:1.5;">${linkHtml(options.link)}</p>`
    : "";
  return {
    html: `<table ${TABLE} width="100%" style="width:100%;margin:0 0 24px;border-collapse:separate;"><tr><td style="background:${t.wash};border-left:4px solid ${t.rule};border-radius:12px;padding:16px 18px;"><table ${TABLE}><tr><td valign="top" style="padding:0 12px 0 0;"><div aria-hidden="true" style="width:24px;height:24px;border-radius:999px;background:${t.ink};color:${color.white};${font}font-size:13px;line-height:24px;font-weight:700;text-align:center;">${t.glyph}</div></td><td valign="top"><p style="margin:2px 0 0;${font}font-size:15px;line-height:1.4;font-weight:700;color:${t.ink};">${textHtml(options.title)}</p>${body}${link}</td></tr></table></td></tr></table>`,
    text: lines(`[${options.title.trim()}]`, options.body?.trim(), options.link && `${options.link.label}: ${options.link.url.trim()}`),
  };
}

// ---------------------------------------------------------------- Structure

/** A hairline, or the brand's four-point sparkle between two sections. */
export function divider(options: { sparkle?: boolean } = {}): Block {
  if (!options.sparkle) {
    return {
      html: `<table ${TABLE} width="100%" style="width:100%;margin:8px 0 24px;"><tr><td style="border-top:1px solid ${color.hairline};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`,
      text: "",
    };
  }
  const rule = `<td width="50%" style="border-top:1px solid ${color.blueBorder};font-size:0;line-height:0;">&nbsp;</td>`;
  return {
    html: `<table ${TABLE} width="100%" style="width:100%;margin:8px 0 24px;"><tr>${rule}<td aria-hidden="true" style="padding:0 14px;${font}font-size:16px;line-height:16px;color:${color.blue};">&#10022;</td>${rule}</tr></table>`,
    text: "",
  };
}

export interface ImageOptions {
  src: string;
  /** Describes the picture; "" only for a purely decorative image. */
  alt: string;
  width: number;
  height: number;
  caption?: string;
  href?: string;
}

/** A full-width picture that scales down on a phone. */
export function image(options: ImageOptions): Block {
  const img = `<img src="${safeSrc(options.src)}" alt="${escapeHtml(options.alt)}" width="${Math.round(options.width)}" height="${Math.round(options.height)}" style="display:block;width:100%;max-width:${Math.round(options.width)}px;height:auto;border:0;border-radius:12px;${font}font-size:14px;color:${color.muted};">`;
  const linked = options.href ? `<a href="${safeHref(options.href)}" style="text-decoration:none;">${img}</a>` : img;
  const caption = options.caption
    ? `<p style="margin:10px 0 0;${font}font-size:13px;line-height:1.5;color:${color.muted};">${textHtml(options.caption)}</p>`
    : "";
  return {
    html: `<div style="margin:0 0 24px;">${linked}${caption}</div>`,
    text: lines(options.caption?.trim(), options.href?.trim()),
  };
}

export interface DetailRow {
  label: string;
  value: string;
}

/** Label / value pairs: account details, a delivery address, a booking. */
export function details(options: { title?: string; rows: DetailRow[] }): Block {
  const rows = options.rows
    .map((row, i) => {
      const rule = i === 0 ? "" : `border-top:1px solid ${color.blueBorder};`;
      return `<tr><td class="gt-dl-label" valign="top" style="${rule}padding:12px 16px 12px 0;${font}font-size:13px;line-height:1.5;font-weight:600;color:${color.blueInk};width:38%;">${textHtml(row.label)}</td><td class="gt-dl-value" valign="top" style="${rule}padding:12px 0;${font}font-size:15px;line-height:1.5;color:${color.ink};">${textHtml(row.value)}</td></tr>`;
    })
    .join("");
  const head = options.title
    ? `<p style="margin:0 0 4px;${font}font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${color.blueInk};">${escapeHtml(options.title)}</p>`
    : "";
  return {
    html: `<table ${TABLE} width="100%" style="width:100%;margin:0 0 24px;border-collapse:separate;"><tr><td style="background:${color.page};border:1px solid ${color.blueBorder};border-radius:12px;padding:16px 20px;">${head}<table ${TABLE} width="100%" style="width:100%;">${rows}</table></td></tr></table>`,
    text: lines(options.title?.toUpperCase(), ...options.rows.map((row) => `${row.label.trim()}: ${row.value.trim()}`)),
  };
}

// ---------------------------------------------------------------- Commerce

export interface OrderLine {
  name: string;
  /** Variant, colour, size… */
  detail?: string;
  quantity?: number;
  /** Formatted total of the line ("24,90 €"). */
  amount: string;
  imageUrl?: string;
  imageAlt?: string;
}

export interface OrderTotal {
  label: string;
  amount: string;
  /** The grand total: larger and bolder. */
  strong?: boolean;
}

export interface OrderSummaryOptions {
  title: string;
  /** "Commande GT-1042 · 7 octobre 2026" */
  reference?: string;
  status?: { label: string; tone: Tone };
  lines: OrderLine[];
  totals: OrderTotal[];
  quantityLabel?: (quantity: number) => string;
}

/** What was bought and what it cost, as snapshotted on the order. */
export function orderSummary(options: OrderSummaryOptions): Block {
  const qty = options.quantityLabel ?? ((n: number) => `× ${n}`);
  const withThumbs = options.lines.some((l) => l.imageUrl);
  const items = options.lines
    .map((line, i) => {
      const rule = i === 0 ? "" : `border-top:1px solid ${color.hairline};`;
      const thumb = line.imageUrl
        ? `<td width="56" valign="top" style="${rule}padding:14px 14px 14px 0;"><img src="${safeSrc(line.imageUrl)}" alt="${escapeHtml(line.imageAlt ?? "")}" width="56" height="56" style="display:block;width:56px;height:56px;border:0;border-radius:10px;background:${color.page};object-fit:cover;"></td>`
        : "";
      const meta = [line.detail?.trim(), line.quantity ? qty(line.quantity) : undefined].filter(Boolean).join(" · ");
      const nameSpan = withThumbs && !thumb ? ' colspan="2"' : "";
      return `<tr>${thumb}<td${nameSpan} valign="top" style="${rule}padding:14px 12px 14px 0;${font}"><p style="margin:0;font-size:15px;line-height:1.45;font-weight:600;color:${color.ink};">${textHtml(line.name)}</p>${meta ? `<p style="margin:2px 0 0;font-size:13px;line-height:1.5;color:${color.muted};">${escapeHtml(meta)}</p>` : ""}</td><td valign="top" align="right" style="${rule}padding:14px 0;${font}font-size:15px;line-height:1.45;color:${color.ink};white-space:nowrap;">${escapeHtml(line.amount)}</td></tr>`;
    })
    .join("");
  const span = withThumbs ? 2 : 1;
  const totals = options.totals
    .map((total, i) => {
      const top = i === 0 ? `border-top:1px solid ${color.blueBorder};padding-top:14px;` : "padding-top:6px;";
      const strong = total.strong
        ? `font-size:17px;font-weight:700;color:${color.ink};`
        : `font-size:14px;color:${color.muted};`;
      return `<tr><td colspan="${span}" style="${top}${font}${strong}line-height:1.5;">${escapeHtml(total.label)}</td><td align="right" style="${top}${font}${strong}line-height:1.5;white-space:nowrap;">${escapeHtml(total.amount)}</td></tr>`;
    })
    .join("");
  const status = options.status ? `<td align="right" valign="middle">${badgeHtml(options.status.label, options.status.tone)}</td>` : "";
  const reference = options.reference
    ? `<p style="margin:2px 0 0;${font}font-size:13px;line-height:1.5;color:${color.muted};">${escapeHtml(options.reference)}</p>`
    : "";
  return {
    html: `<table ${TABLE} width="100%" style="width:100%;margin:0 0 24px;border-collapse:separate;"><tr><td style="border:1px solid ${color.blueBorder};border-radius:12px;padding:18px 20px 16px;"><table ${TABLE} width="100%" style="width:100%;"><tr><td valign="middle"><p style="margin:0;${font}font-size:16px;line-height:1.4;font-weight:700;color:${color.ink};">${escapeHtml(options.title)}</p>${reference}</td>${status}</tr></table><table ${TABLE} width="100%" style="width:100%;margin-top:6px;">${items}${totals}</table></td></tr></table>`,
    text: lines(
      options.title.toUpperCase(),
      options.reference,
      options.status && `${options.status.label}`,
      ...options.lines.map((l) =>
        `- ${l.name.trim()}${l.detail ? ` (${l.detail.trim()})` : ""}${l.quantity ? ` ${qty(l.quantity)}` : ""}: ${l.amount}`
      ),
      ...options.totals.map((t) => `${t.label}: ${t.amount}`),
    ),
  };
}

export interface ProductCardOptions {
  imageUrl: string;
  imageAlt: string;
  name: string;
  description?: string;
  /** Formatted price. */
  price?: string;
  badge?: { label: string; tone: Tone };
  link?: Link;
}

/**
 * A product with its picture. Picture beside the text on a desktop; on a narrow
 * screen the two columns wrap, without needing media-query support.
 */
export function productCard(options: ProductCardOptions): Block {
  const badge = options.badge ? `<div style="margin:0 0 8px;">${badgeHtml(options.badge.label, options.badge.tone)}</div>` : "";
  const description = options.description
    ? `<p style="margin:4px 0 0;${font}font-size:14px;line-height:1.55;color:${color.muted};">${textHtml(options.description)}</p>`
    : "";
  const price = options.price
    ? `<p style="margin:10px 0 0;${font}font-size:16px;line-height:1.4;font-weight:700;color:${color.ink};">${escapeHtml(options.price)}</p>`
    : "";
  const link = options.link
    ? `<p style="margin:12px 0 0;${font}font-size:14px;line-height:1.5;">${linkHtml(options.link)}&nbsp;<span aria-hidden="true">&rarr;</span></p>`
    : "";
  return {
    html: `<table ${TABLE} width="100%" style="width:100%;margin:0 0 24px;border-collapse:separate;"><tr><td style="border:1px solid ${color.blueBorder};border-radius:12px;padding:16px;font-size:0;">
<!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="136" valign="top"><![endif]-->
<div class="gt-col" style="display:inline-block;width:100%;max-width:136px;vertical-align:top;"><img src="${safeSrc(options.imageUrl)}" alt="${escapeHtml(options.imageAlt)}" width="136" height="136" style="display:block;width:100%;max-width:136px;height:auto;border:0;border-radius:10px;background:${color.page};${font}font-size:13px;color:${color.muted};"></div>
<!--[if mso]></td><td valign="top"><![endif]-->
<div class="gt-col" style="display:inline-block;width:100%;max-width:330px;vertical-align:top;"><table ${TABLE} width="100%" style="width:100%;"><tr><td class="gt-col-pad" style="padding:4px 0 0 18px;">${badge}<p style="margin:0;${font}font-size:16px;line-height:1.4;font-weight:700;color:${color.ink};">${textHtml(options.name)}</p>${description}${price}${link}</td></tr></table></div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`,
    text: lines(
      `${options.name.trim()}${options.price ? ` — ${options.price}` : ""}`,
      options.description?.trim(),
      options.link && `${options.link.label}: ${options.link.url.trim()}`,
    ),
  };
}

export interface CourseCardOptions {
  imageUrl?: string;
  imageAlt?: string;
  title: string;
  /** Short facts shown above the title: level, duration, number of lessons. */
  facts?: string[];
  description?: string;
  badge?: { label: string; tone: Tone };
  link?: Link;
}

/** An Academy course: cover on top, facts, title, description, way in. */
export function courseCard(options: CourseCardOptions): Block {
  const cover = options.imageUrl
    ? `<tr><td style="padding:0;"><img src="${safeSrc(options.imageUrl)}" alt="${escapeHtml(options.imageAlt ?? "")}" width="518" height="259" style="display:block;width:100%;max-width:518px;height:auto;border:0;border-radius:11px 11px 0 0;background:${color.blueWash};${font}font-size:13px;color:${color.muted};"></td></tr>`
    : "";
  const facts = options.facts?.length
    ? `<p style="margin:0 0 8px;${font}font-size:11px;line-height:1.5;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${color.blueInk};">${options.facts.map(escapeHtml).join("&nbsp;&nbsp;·&nbsp;&nbsp;")}</p>`
    : "";
  const badge = options.badge ? `<div style="margin:0 0 10px;">${badgeHtml(options.badge.label, options.badge.tone)}</div>` : "";
  const description = options.description
    ? `<p style="margin:6px 0 0;${font}font-size:15px;line-height:1.6;color:${color.body};">${textHtml(options.description)}</p>`
    : "";
  const link = options.link
    ? `<p style="margin:14px 0 0;${font}font-size:15px;line-height:1.5;">${linkHtml(options.link)}&nbsp;<span aria-hidden="true">&rarr;</span></p>`
    : "";
  return {
    html: `<table ${TABLE} width="100%" style="width:100%;margin:0 0 24px;border-collapse:separate;background:${color.page};border:1px solid ${color.blueBorder};border-radius:12px;">${cover}<tr><td style="padding:20px 22px 22px;">${badge}${facts}<h3 style="margin:0;${font}font-size:19px;line-height:1.3;font-weight:700;color:${color.ink};">${textHtml(options.title)}</h3>${description}${link}</td></tr></table>`,
    text: lines(
      options.title.trim(),
      options.facts?.join(" · "),
      options.description?.trim(),
      options.link && `${options.link.label}: ${options.link.url.trim()}`,
    ),
  };
}

export type GiftCardDesignName = "sparkle" | "blush" | "mint" | "noir" | "photo";

export interface GiftCardVisualOptions {
  /** The design chosen by the buyer; anything unknown falls back to `sparkle`. */
  design: string;
  /** Formatted amount ("50,00 €"). */
  amount: string;
  /** "Carte cadeau" */
  label: string;
  /** "Pour Léa" */
  recipient?: string;
  /** "De la part de Camille" */
  sender?: string;
  /** The buyer's message, as written. */
  message?: string;
}

// The site's `.gt-giftcard[data-design]` washes (webapp/src/index.css) as literals:
// a solid fallback for clients that drop gradients, the gradient on top.
const CARD_DESIGNS: Record<GiftCardDesignName, { from: string; to: string; ink: string; dark: boolean; bubble: string }> = {
  sparkle: { from: "#e7eef7", to: "#9cb4d3", ink: color.ink, dark: false, bubble: "rgba(255,255,255,0.6)" },
  blush: { from: "#fdeaf3", to: "#f59cc7", ink: color.ink, dark: false, bubble: "rgba(255,255,255,0.6)" },
  mint: { from: "#e4f9f0", to: "#8ff0cb", ink: color.ink, dark: false, bubble: "rgba(255,255,255,0.6)" },
  noir: { from: color.ink, to: color.body, ink: "#fafaf8", dark: true, bubble: "rgba(17,17,17,0.35)" },
  // The photo card is a picture on the site; an e-mail keeps its dark wash.
  photo: { from: color.ink, to: color.body, ink: "#fafaf8", dark: true, bubble: "rgba(17,17,17,0.35)" },
};

/**
 * The gift card as the buyer designed it: same colours, same arrangement
 * (label top, message, "for", amount, "from") as the storefront's preview, so
 * what was written at checkout is what the recipient opens. The code is not on
 * the card; it is given in the text under it.
 */
export function giftCardVisual(options: GiftCardVisualOptions): Block {
  const d = CARD_DESIGNS[options.design as GiftCardDesignName] ?? CARD_DESIGNS.sparkle;
  const message = options.message?.trim()
    ? `<tr><td style="padding:14px 0 0;"><table ${TABLE}><tr><td style="background:${d.dark ? "#2a2a2a" : "#ffffff"};background:${d.bubble};border-radius:10px;padding:8px 12px;${font}font-size:13px;line-height:1.45;font-style:italic;color:${d.dark ? d.ink : color.body};">“${textHtml(options.message)}”</td></tr></table></td></tr>`
    : "";
  const recipient = options.recipient?.trim()
    ? `<p style="margin:0 0 4px;${font}font-size:11px;line-height:1.3;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${d.ink};opacity:0.8;">${escapeHtml(options.recipient.trim())}</p>`
    : "";
  const sender = options.sender?.trim()
    ? `<td align="right" valign="bottom" style="${font}font-size:11px;line-height:1.3;color:${d.ink};opacity:0.8;">${escapeHtml(options.sender.trim())}</td>`
    : "";
  return {
    html: `<table ${TABLE} width="100%" style="width:100%;margin:0 0 24px;border-collapse:separate;"><tr><td bgcolor="${d.from}" style="background:${d.from};background-image:linear-gradient(135deg,${d.from},${d.to});border-radius:16px;padding:22px 24px;"><table ${TABLE} width="100%" style="width:100%;"><tr><td style="${font}font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${d.ink};">Global Toothgems</td><td align="right" style="${font}font-size:10px;line-height:1.3;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${d.ink};">${escapeHtml(options.label)}</td></tr>${message}<tr><td colspan="2" style="padding:${message ? "18" : "40"}px 0 0;">${recipient}</td></tr><tr><td valign="bottom" style="${font}font-size:36px;line-height:1.1;font-weight:700;letter-spacing:-0.01em;color:${d.ink};">${escapeHtml(options.amount)}</td>${sender}</tr></table></td></tr></table>`,
    text: lines(
      `${options.label.toUpperCase()} — ${options.amount}`,
      options.recipient?.trim(),
      options.message?.trim() && `“${options.message.trim()}”`,
      options.sender?.trim(),
    ),
  };
}

export interface PromoOptions {
  eyebrow?: string;
  title: string;
  body?: string;
  code?: { label: string; value: string };
  link?: Link;
}

/** Commercial highlight: the one place fuchsia appears. Its link is an outlined button, so emerald stays the e-mail's main action. */
export function promo(options: PromoOptions): Block {
  const eyebrowHtml = options.eyebrow
    ? `<p style="margin:0 0 10px;${font}font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${color.fuchsiaInk};"><span aria-hidden="true" style="color:${color.fuchsia};">&#10022;</span>&nbsp; ${escapeHtml(options.eyebrow)}</p>`
    : "";
  const body = options.body
    ? `<p style="margin:8px 0 0;${font}font-size:15px;line-height:1.6;color:${color.body};">${textHtml(options.body)}</p>`
    : "";
  const code = options.code
    ? `<table ${TABLE} style="margin:18px 0 0;border-collapse:separate;"><tr><td style="background:${color.white};border:1.5px dashed ${color.fuchsia};border-radius:10px;padding:10px 18px;"><p style="margin:0;${font}font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${color.muted};">${escapeHtml(options.code.label)}</p><p style="margin:2px 0 0;${font}font-size:20px;line-height:1.3;font-weight:700;letter-spacing:0.12em;color:${color.ink};">${escapeHtml(options.code.value)}</p></td></tr></table>`
    : "";
  const link = options.link ? `<div style="margin:18px 0 0;">${buttonTable(options.link, "secondary")}</div>` : "";
  return {
    html: `<table ${TABLE} width="100%" style="width:100%;margin:0 0 24px;border-collapse:separate;"><tr><td style="background:${color.fuchsiaWash};border-radius:12px;padding:22px 24px;">${eyebrowHtml}<p style="margin:0;${font}font-size:20px;line-height:1.3;font-weight:700;color:${color.ink};">${textHtml(options.title)}</p>${body}${code}${link}</td></tr></table>`,
    text: lines(
      options.eyebrow?.toUpperCase(),
      options.title.trim(),
      options.body?.trim(),
      options.code && `${options.code.label}: ${options.code.value}`,
      options.link && `${options.link.label}: ${options.link.url.trim()}`,
    ),
  };
}
