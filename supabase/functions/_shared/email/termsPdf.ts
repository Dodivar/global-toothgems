/**
 * The terms every contract confirmation carries on a durable medium (art.
 * L221-13 of the French Consumer Code, decision 130): the terms of sale with
 * the shop order confirmation (goods, courses and gift cards bought — the
 * seller), the 3D Studio subscription terms with the Studio subscription
 * confirmation (the website publisher, decision 133).
 *
 * The PDF is drawn from the web page's own data (`_shared/legal/`, a generated
 * copy of webapp/src/data/legal/, `npm run sync:documents`) by the documents'
 * template, in the order's language, filled with the seller's details from
 * Settings › Store, in the version this build holds (`TERMS_OF_SALE_VERSION`,
 * the one checkout records on the order).
 *
 * Safe fallback: if the PDF cannot be drawn, the same text goes into the
 * e-mail itself, as HTML, and the failure is logged — never an e-mail without
 * the terms. Retrying on the next sweep would not help: drawing is local and
 * deterministic (a text the template cannot lay out fails every time), and
 * the order confirmation is not swept at all; the e-mail body is a durable
 * medium too. The footer names the version either way.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import type { DocumentBlock } from "../documents/template.ts";
import { renderDocument } from "../documents/template.ts";
import type { LegalStoreDetails } from "../legal/storeFill.ts";
import {
  contractTermsDocument,
  contractTermsFileName,
  contractTermsSource,
  contractTermsVersion,
  type ContractTermsKind,
  legalDocumentBlocks,
  STUDIO_TERMS_VERSION,
  type TermsLang,
  TERMS_OF_SALE_VERSION,
} from "../legal/termsDocument.ts";
import { type Block, heading, paragraph } from "./components.ts";
import { escapeHtml } from "./html.ts";
import { documentFormat, documentTranslator, type MailAttachment, toBase64 } from "./invoicePdf.ts";
import { chromeLocale } from "./layout.ts";
import { color, fontStack } from "./tokens.ts";

export { type ContractTermsKind, STUDIO_TERMS_VERSION, TERMS_OF_SALE_VERSION };

/** A contract's terms ready for one e-mail: attached as a PDF, or written into it. */
export interface TermsForEmail {
  /** Which contract's terms: the terms of sale, or the 3D Studio subscription terms. */
  kind: ContractTermsKind;
  version: string;
  /** The language of the copy (the order's or the member's). */
  lang: TermsLang;
  /** The PDF, or null when it could not be drawn (then `fallback` holds the text). */
  attachment: MailAttachment | null;
  /** The full text as e-mail blocks when there is no PDF; empty otherwise. */
  fallback: Block[];
}

/** Produces a contract's terms for an e-mail in a locale, for a reference ("Order GT-…"); the terms of sale by default. */
export type TermsProvider = (locale: string, reference: string, kind?: ContractTermsKind) => Promise<TermsForEmail>;

type Log = (message: string, detail?: unknown) => void;

const LABELS = {
  fr: {
    order: (number: string) => `Commande ${number}`,
    studio: (plan: string) => `Abonnement Studio 3D — ${plan}`,
  },
  en: {
    order: (number: string) => `Order ${number}`,
    studio: (plan: string) => `3D Studio subscription — ${plan}`,
  },
} as const;

/** The e-mail's words for each contract's terms. */
const TERMS_LABELS = {
  sale: {
    fr: {
      attached: (version: string) => `Conditions générales de vente jointes à cet e-mail (PDF) : version du ${version}.`,
      inline: (version: string) => `Conditions générales de vente reproduites dans cet e-mail : version du ${version}.`,
      fallbackTitle: (version: string) => `Conditions générales de vente — version du ${version}`,
      fallbackIntro:
        "Le document PDF n’a pas pu être joint : voici le texte intégral des conditions générales de vente qui s’appliquent à votre commande. Conservez cet e-mail.",
    },
    en: {
      attached: (version: string) => `Terms of sale attached to this email (PDF): version of ${version}.`,
      inline: (version: string) => `Terms of sale reproduced in this email: version of ${version}.`,
      fallbackTitle: (version: string) => `Terms of sale — version of ${version}`,
      fallbackIntro:
        "The PDF could not be attached: here is the full text of the terms of sale that apply to your order. Keep this email.",
    },
  },
  studio: {
    fr: {
      attached: (version: string) => `Conditions générales d’abonnement au Studio 3D jointes à cet e-mail (PDF) : version du ${version}.`,
      inline: (version: string) => `Conditions générales d’abonnement au Studio 3D reproduites dans cet e-mail : version du ${version}.`,
      fallbackTitle: (version: string) => `Conditions générales d’abonnement au Studio 3D — version du ${version}`,
      fallbackIntro:
        "Le document PDF n’a pas pu être joint : voici le texte intégral des conditions d’abonnement qui s’appliquent à votre abonnement. Conservez cet e-mail.",
    },
    en: {
      attached: (version: string) => `3D Studio subscription terms attached to this email (PDF): version of ${version}.`,
      inline: (version: string) => `3D Studio subscription terms reproduced in this email: version of ${version}.`,
      fallbackTitle: (version: string) => `3D Studio subscription terms — version of ${version}`,
      fallbackIntro:
        "The PDF could not be attached: here is the full text of the subscription terms that apply to your subscription. Keep this email.",
    },
  },
} as const;

/** The language of the copy: French or English, like the documents. */
export function termsLang(locale: string): TermsLang {
  return chromeLocale(locale);
}

/** "Order GT-2026-000123" / "Commande GT-2026-000123". */
export function orderReference(orderNumber: string, locale: string): string {
  return LABELS[termsLang(locale)].order(orderNumber);
}

/** "3D Studio subscription — Artist". */
export function studioReference(planName: string, locale: string): string {
  return LABELS[termsLang(locale)].studio(planName);
}

function versionLabel(kind: ContractTermsKind, lang: TermsLang): string {
  return documentFormat(lang).date(`${contractTermsVersion(kind)}T12:00:00Z`);
}

/** The footer line naming the terms and the version given, in the e-mail's language. */
export function termsFooterNote(terms: TermsForEmail, locale: string): string {
  const lang = termsLang(locale);
  const words = TERMS_LABELS[terms.kind][lang];
  return terms.attachment ? words.attached(versionLabel(terms.kind, lang)) : words.inline(versionLabel(terms.kind, lang));
}

const strongStyle = `margin:18px 0 8px;font-family:${fontStack};font-size:16px;line-height:1.4;font-weight:700;color:${color.ink};`;

function clause(text: string): Block {
  return { html: `<p style="${strongStyle}">${escapeHtml(text)}</p>`, text: text.trim() };
}

/** The flattened terms as e-mail blocks (the same blocks the PDF lays out). */
export function termsFallbackBlocks(blocks: DocumentBlock[], lang: TermsLang, kind: ContractTermsKind = "sale"): Block[] {
  const version = versionLabel(kind, lang);
  const words = TERMS_LABELS[kind][lang];
  const out: Block[] = [heading(words.fallbackTitle(version)), paragraph(words.fallbackIntro)];
  for (const block of blocks) {
    if (block.kind === "heading") out.push(block.level === 2 ? clause(block.text) : heading(block.text));
    else if (block.kind === "paragraph") out.push(paragraph(block.text));
    else if (block.kind === "table") {
      const labels = block.columns.map((c) => c.label);
      out.push(...block.rows.map((row) =>
        paragraph(row.cells.map((cell, i) => (i === 0 ? cell : `${labels[i]} : ${cell}`)).filter(Boolean).join(" — ") + (row.detail ? `\n${row.detail}` : ""))
      ));
    } else out.push(...block.rows.map((row) => paragraph(`${row.label} : ${row.value}`)));
  }
  return out;
}

export interface TermsOptions {
  /** Draws the PDF; injected by tests to simulate a failure. */
  render?: typeof renderDocument;
  log?: Log;
}

/** A contract's terms for one e-mail: the PDF, else the text written into the e-mail (logged). */
export function contractTermsForEmail(
  kind: ContractTermsKind,
  store: LegalStoreDetails | null,
  locale: string,
  reference: string,
  options: TermsOptions = {},
): TermsForEmail {
  const lang = termsLang(locale);
  const t = documentTranslator(lang);
  const version = contractTermsVersion(kind);
  try {
    const bytes = (options.render ?? renderDocument)(
      contractTermsDocument(kind, { lang, t, date: (iso) => documentFormat(lang).date(`${iso}T12:00:00Z`), store, reference }),
    );
    return {
      kind,
      version,
      lang,
      attachment: { filename: contractTermsFileName(kind, t), content: toBase64(bytes) },
      fallback: [],
    };
  } catch (error) {
    options.log?.(`${kind === "studio" ? "Studio subscription terms" : "terms of sale"} PDF not drawn: the text goes into the e-mail`, {
      reference,
      error: error instanceof Error ? error.message : error,
    });
    return {
      kind,
      version,
      lang,
      attachment: null,
      fallback: termsFallbackBlocks(legalDocumentBlocks(contractTermsSource(kind, store), lang, t), lang, kind),
    };
  }
}

/** The terms of sale for one e-mail (the shop's contracts). */
export function termsOfSaleForEmail(
  store: LegalStoreDetails | null,
  locale: string,
  reference: string,
  options: TermsOptions = {},
): TermsForEmail {
  return contractTermsForEmail("sale", store, locale, reference, options);
}

/** The 3D Studio subscription terms for one e-mail (the publisher's contract, decision 133). */
export function studioTermsForEmail(
  store: LegalStoreDetails | null,
  locale: string,
  reference: string,
  options: TermsOptions = {},
): TermsForEmail {
  return contractTermsForEmail("studio", store, locale, reference, options);
}

/** The store details the terms quote, read from Settings › Store; null when no row exists. */
export async function loadLegalStore(db: SupabaseClient): Promise<LegalStoreDetails | null> {
  const { data, error } = await db
    .from("store_settings")
    .select(
      "trading_name, legal_name, legal_form, publisher_name, publisher_legal_name, publisher_legal_form, publisher_registration_number, publisher_address, registration_number, support_email, country_code, address_line1, address_line2, postal_code, city, region",
    )
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`store_settings read failed: ${error.message}`);
  if (!data) return null;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    tradingName: text(data.trading_name),
    legalName: text(data.legal_name),
    legalForm: text(data.legal_form),
    publisherName: text(data.publisher_name),
    publisherLegalName: text(data.publisher_legal_name),
    publisherLegalForm: text(data.publisher_legal_form),
    publisherRegistrationNumber: text(data.publisher_registration_number),
    publisherAddress: text(data.publisher_address),
    registrationNumber: text(data.registration_number),
    supportEmail: text(data.support_email),
    country: text(data.country_code) || "FR",
    address1: text(data.address_line1),
    address2: text(data.address_line2),
    postalCode: text(data.postal_code),
    city: text(data.city),
    region: text(data.region),
  };
}

/**
 * The provider the senders use: reads the store once per run (the sweep and
 * the payment hook send several e-mails in a row), then draws a copy per e-mail.
 */
export function supabaseTermsProvider(db: SupabaseClient, log?: Log): TermsProvider {
  let store: Promise<LegalStoreDetails | null> | null = null;
  return async (locale, reference, kind = "sale") => {
    store ??= loadLegalStore(db).catch((error) => {
      store = null;
      throw error;
    });
    return contractTermsForEmail(kind, await store, locale, reference, { log });
  };
}

/** What an e-mail adds for the terms: the attachment, or the text blocks, and the footer line. */
export function withTerms(terms: TermsForEmail, locale: string): { attachments: MailAttachment[]; blocks: Block[]; footerNote: string } {
  return {
    attachments: terms.attachment ? [terms.attachment] : [],
    blocks: terms.fallback,
    footerNote: termsFooterNote(terms, locale),
  };
}
