/**
 * The master layout of every Global Toothgems e-mail: document shell, header
 * with the logo, a white card holding the content blocks, and the footer
 * (support, legal links, optional social links and unsubscribe, copyright).
 *
 * Built for e-mail clients, not browsers: tables and inline styles; a fluid
 * 600px column that needs no media query (Gmail apps on other accounts ignore
 * them) and is only refined by the `<style>` block; an Outlook ghost table;
 * no CSS variables, no background images, no box-shadow that matters.
 * Only the content blocks change from one e-mail to the next.
 */
import type { Block, Link } from "./components.ts";
import { escapeHtml, safeHref, safeSrc } from "./html.ts";
import { color, fontStack, size } from "./tokens.ts";

export interface LayoutOptions {
  brandName: string;
  /** Production origin, used for the logo and the footer links (e.g. https://globaltoothgems.com). */
  siteUrl: string;
  /** Defaults to `${siteUrl}/email/logo-wordmark.png` (webapp/public/email). */
  logoUrl?: string;
  /** The brand's social accounts, shown in the footer when given. None by default. */
  socialLinks?: Link[];
  /** Sender's postal address (store details), shown in the footer when given. */
  postalAddress?: string;
  /** For the copyright year; tests pin it. */
  now?: Date;
}

export interface EmailDocument {
  locale: string;
  subject: string;
  preheader: string;
  blocks: Block[];
  /** Marketing e-mails only: a one-click unsubscribe address. Transactional e-mails have none. */
  unsubscribeUrl?: string;
}

interface Chrome {
  support: string;
  contact: string;
  help: string;
  legal: string;
  privacy: string;
  terms: string;
  reasonTransactional: string;
  reasonMarketing: string;
  unsubscribe: string;
  tagline: string;
  footerNav: string;
}

/** Layout strings. German is not a launch language: anything but fr falls back to English. */
const CHROME: Record<"fr" | "en", Chrome> = {
  fr: {
    support: "Une question ? Notre équipe vous répond avec plaisir.",
    contact: "Contacter le service client",
    help: "Centre d’aide",
    legal: "Mentions légales",
    privacy: "Confidentialité",
    terms: "Conditions générales de vente",
    reasonTransactional: "Vous recevez cet e-mail au sujet de votre compte, d’une commande ou d’une formation Global Toothgems.",
    reasonMarketing: "Vous recevez cet e-mail car vous êtes inscrit·e à nos actualités.",
    unsubscribe: "Se désinscrire",
    tagline: "Gems, outils et formation professionnels. Expédié dans toute l’Europe depuis Lyon.",
    footerNav: "Liens utiles",
  },
  en: {
    support: "Questions? Our team is happy to help.",
    contact: "Contact customer care",
    help: "Help centre",
    legal: "Legal notice",
    privacy: "Privacy policy",
    terms: "Terms of sale",
    reasonTransactional: "You are receiving this e-mail about your Global Toothgems account, an order or a course.",
    reasonMarketing: "You are receiving this e-mail because you subscribed to our news.",
    unsubscribe: "Unsubscribe",
    tagline: "Professional gems, tools and training. Shipped across Europe from Lyon.",
    footerNav: "Useful links",
  },
};

/** Public addresses, mirrored from webapp/src/lib/localeRoutes.ts (Edge Functions cannot import the webapp). */
const PATHS: Record<"fr" | "en", Record<"home" | "help" | "contact" | "legal" | "privacy" | "terms", string>> = {
  fr: {
    home: "/fr",
    help: "/fr/aide",
    contact: "/fr/contact",
    legal: "/fr/mentions-legales",
    privacy: "/fr/confidentialite",
    terms: "/fr/conditions-generales",
  },
  en: {
    home: "/en",
    help: "/en/help",
    contact: "/en/contact",
    legal: "/en/legal-notice",
    privacy: "/en/privacy-policy",
    terms: "/en/terms-of-sale",
  },
};

export function chromeLocale(locale: string): "fr" | "en" {
  return locale.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function sitePath(siteUrl: string, locale: string, page: keyof (typeof PATHS)["fr"]): string {
  return `${siteUrl.replace(/\/+$/, "")}${PATHS[chromeLocale(locale)][page]}`;
}

const font = `font-family:${fontStack};`;
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

const HEAD_STYLE = `<style>
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
u+#body a{color:inherit;}
@media (max-width:620px){
.gt-outer{padding:12px 8px 24px!important;}
.gt-px{padding-left:22px!important;padding-right:22px!important;}
.gt-h1{font-size:25px!important;}
.gt-btn-wrap{display:block!important;margin:0 0 12px!important;}
.gt-btn{width:100%!important;}
.gt-btn-a{display:block!important;}
.gt-col{display:block!important;max-width:100%!important;}
.gt-col-pad{padding:14px 0 0!important;}
.gt-dl-label,.gt-dl-value{display:block!important;width:auto!important;}
.gt-dl-label{padding:12px 0 0!important;}
.gt-dl-value{padding:2px 0 12px!important;border-top:0!important;}
}
</style>`;

function footerLink(label: string, href: string): string {
  return `<a href="${safeHref(href)}" style="color:${color.body};text-decoration:underline;white-space:nowrap;">${escapeHtml(label)}</a>`;
}

function footer(doc: EmailDocument, layout: LayoutOptions): { html: string; text: string } {
  const lang = chromeLocale(doc.locale);
  const t = CHROME[lang];
  const site = layout.siteUrl;
  const year = (layout.now ?? new Date()).getUTCFullYear();
  const brand = escapeHtml(layout.brandName);
  // Plain spaces around the sparkle: the row must be able to wrap between links on a phone.
  const sep = ` <span aria-hidden="true" style="color:${color.blue};">&nbsp;&#10022;&nbsp;</span> `;
  const legal = [
    footerLink(t.help, sitePath(site, lang, "help")),
    footerLink(t.legal, sitePath(site, lang, "legal")),
    footerLink(t.privacy, sitePath(site, lang, "privacy")),
    footerLink(t.terms, sitePath(site, lang, "terms")),
  ].join(sep);
  const social = layout.socialLinks?.length
    ? `<tr><td align="center" style="padding:0 0 14px;${font}font-size:13px;line-height:1.6;font-weight:600;">${
      layout.socialLinks.map((s) => footerLink(s.label, s.url)).join(sep)
    }</td></tr>`
    : "";
  const reason = doc.unsubscribeUrl ? t.reasonMarketing : t.reasonTransactional;
  const unsubscribe = doc.unsubscribeUrl ? ` ${footerLink(t.unsubscribe, doc.unsubscribeUrl)}` : "";
  const address = layout.postalAddress ? `<br>${escapeHtml(layout.postalAddress)}` : "";
  const muted = `${font}font-size:12px;line-height:1.6;color:${color.muted};`;

  const html = `<table ${TABLE} width="100%" style="width:100%;">
<tr><td align="center" class="gt-px" style="padding:32px 32px 18px;"><p style="margin:0;${font}font-size:15px;line-height:1.5;color:${color.body};">${escapeHtml(t.support)}</p><p style="margin:6px 0 0;${font}font-size:15px;line-height:1.5;font-weight:700;">${
    footerLink(t.contact, sitePath(site, lang, "contact"))
  }</p></td></tr>
<tr><td align="center" style="padding:0 32px 18px;"><table ${TABLE} width="64" style="width:64px;"><tr><td style="border-top:1px solid ${color.blue};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
${social}<tr><td align="center" class="gt-px" style="padding:0 24px 16px;${font}font-size:13px;line-height:2;" role="navigation" aria-label="${escapeHtml(t.footerNav)}">${legal}</td></tr>
<tr><td align="center" class="gt-px" style="padding:0 32px;${muted}">${escapeHtml(reason)}${unsubscribe}</td></tr>
<tr><td align="center" class="gt-px" style="padding:14px 32px 0;${muted}"><span style="font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:${color.ink};">${brand}</span><br>${escapeHtml(t.tagline)}${address}<br>&copy; ${year} ${brand}</td></tr>
</table>`;

  const text = [
    doc.unsubscribeUrl ? `${t.unsubscribe}: ${doc.unsubscribeUrl.trim()}` : "",
    `${t.contact}: ${sitePath(site, lang, "contact")}`,
    `— ${layout.brandName}\n${site}`,
  ].filter(Boolean).join("\n\n");
  return { html, text };
}

/** Wraps content blocks in the brand layout; returns the HTML document and the text twin. */
export function emailDocument(doc: EmailDocument, layout: LayoutOptions): { html: string; text: string } {
  const lang = escapeHtml(doc.locale);
  const subject = escapeHtml(doc.subject);
  const logo = safeSrc(layout.logoUrl ?? `${layout.siteUrl.replace(/\/+$/, "")}/email/logo-wordmark.png`);
  const home = safeHref(sitePath(layout.siteUrl, doc.locale, "home"));
  const foot = footer(doc, layout);
  // Filler after the preheader keeps the first lines of the body out of the inbox preview.
  const filler = "&#847;&zwnj;&nbsp;".repeat(60);

  const html = `<!doctype html>
<html lang="${lang}" dir="ltr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,p,a,h1,h2,h3,span,div{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;1,400&amp;display=swap" rel="stylesheet"><!--<![endif]-->
${HEAD_STYLE}
</head>
<body id="body" style="margin:0;padding:0;background:${color.page};">
<div role="article" aria-roledescription="email" aria-label="${subject}" lang="${lang}" style="background:${color.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${color.page};">${escapeHtml(doc.preheader)}${filler}</div>
<table ${TABLE} width="100%" style="width:100%;background:${color.page};">
<tr><td align="center" class="gt-outer" style="padding:32px 16px 40px;">
<!--[if mso]><table role="presentation" width="${size.container}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<div style="max-width:${size.container}px;margin:0 auto;">
<table ${TABLE} width="100%" style="width:100%;background:${color.white};border:1px solid ${color.blueBorder};border-radius:${size.radiusCard}px;border-collapse:separate;box-shadow:0 14px 32px -10px rgba(35,52,71,0.18);">
<tr><td align="center" class="gt-px" style="padding:36px ${size.gutter}px 26px;"><a href="${home}" style="text-decoration:none;"><img src="${logo}" alt="${escapeHtml(layout.brandName)}" width="${size.logoWidth}" height="${size.logoHeight}" style="display:block;width:${size.logoWidth}px;max-width:100%;height:auto;border:0;${font}font-size:18px;line-height:24px;font-weight:700;letter-spacing:0.2em;color:${color.ink};"></a></td></tr>
<tr><td class="gt-px" style="padding:0 ${size.gutter}px;"><table ${TABLE} width="100%" style="width:100%;"><tr><td style="border-top:1px solid ${color.blueBorder};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td class="gt-px" style="padding:36px ${size.gutter}px 20px;${font}text-align:left;">
${doc.blocks.map((b) => b.html).join("\n")}
</td></tr>
</table>
${foot.html}
</div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>`;

  const body = doc.blocks.map((b) => b.text).filter((t) => t.trim().length > 0).join("\n\n");
  return { html, text: `${body}\n\n${foot.text}\n` };
}
