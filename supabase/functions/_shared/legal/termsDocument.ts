// Generated from webapp/src/data/legal/termsDocument.ts by webapp/scripts/sync-documents.mjs — edit the source, then run `npm run sync:documents`.
import { legalFooterLines, type Translate } from "../documents/legal.ts";
import type { BusinessDocument, DocumentBlock } from "../documents/template.ts";
import { officeAddress, withStoreDetails, type LegalStoreDetails } from "./storeFill.ts";
import { TERMS, TERMS_OF_SALE_VERSION } from "./terms.ts";
import type { Block, LegalDocument } from "./types.ts";

/**
 * The terms of sale as a PDF: the copy on a durable medium that every contract
 * confirmation e-mail carries (art. L221-13 of the French Consumer Code,
 * decision 130). Built from the very data the web page renders (`terms.ts`,
 * the rules of `policies.ts`, the seller's details filled by `storeFill.ts`),
 * so the PDF and the page cannot say different things; laid out by the shared
 * document template (`lib/documents/template.ts`), so no PDF dependency.
 *
 * The same flattened blocks feed the e-mail's HTML fallback when a PDF cannot
 * be drawn (`supabase/functions/_shared/email/termsPdf.ts`).
 *
 * Pure and portable: copied to `supabase/functions/_shared/legal/` by
 * `npm run sync:documents`, with `terms.ts`, `policies.ts`, `types.ts`,
 * `routes.ts` and `storeFill.ts`.
 */

export type TermsLang = "fr" | "en";

export interface TermsPdfOptions {
  lang: TermsLang;
  /** The documents' strings in `lang` (`documents.terms.*`, `documents.footer.*`, `documents.page`). */
  t: Translate;
  /** A long date in `lang` ("9 novembre 2026") for an ISO day. */
  date: (iso: string) => string;
  /** Settings › Store: fills the seller's identity; null leaves the "to supply" markers. */
  store: LegalStoreDetails | null;
  /** What the copy is given for: an order number, "3D Studio — Artist"… Printed under the version. */
  reference?: string;
}

/** Inline markup of the legal pages as plain text: links keep their label, markers their label flagged. */
export function plainText(value: string, toSupply: string): string {
  return value
    .replace(/<<([^|>]+)\|[^>]*>>/g, "$1")
    .replace(/\[\[!([^\]]+)\]\]/g, `[$1 — ${toSupply}]`)
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

function blockToDocument(block: Block, lang: TermsLang, t: Translate): DocumentBlock[] {
  const toSupply = t("documents.terms.toSupply");
  const text = (value: { fr: string; en: string }) => plainText(value[lang], toSupply);
  switch (block.kind) {
    case "p":
      return [{ kind: "paragraph", text: text(block.text) }];
    case "list":
      return [{ kind: "paragraph", text: block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : "•"} ${text(item)}`).join("\n") }];
    case "callout": {
      const head = [block.title && text(block.title), text(block.text)].filter(Boolean).join(" — ");
      const items = (block.items ?? []).map((item) => `• ${text(item)}`);
      return [{ kind: "paragraph", tone: "notice", text: [head, ...items].join("\n") }];
    }
    case "fields":
      return [{
        kind: "table",
        columns: [
          { label: t("documents.terms.fieldColumn"), width: 1 },
          { label: t("documents.terms.valueColumn"), width: 2 },
        ],
        rows: block.fields.map((field) => ({
          cells: [
            text(field.label),
            field.value ? text(field.value) : `[${text(field.placeholder ?? field.label)} — ${toSupply}]`,
          ],
          ...(field.hint ? { detail: text(field.hint) } : {}),
        })),
      }];
    case "table":
      return [
        { kind: "paragraph", tone: "muted", text: text(block.caption) },
        {
          kind: "table",
          columns: block.columns.map((column) => ({ label: text(column.label), width: 1 })),
          rows: block.rows.map((row) => ({ cells: block.columns.map((column) => (row[column.key] ? text(row[column.key]) : "")) })),
        },
      ];
    case "cards":
      return block.items.map((item) => ({ kind: "paragraph", text: `${text(item.title)} — ${text(item.text)}` }));
    case "steps":
      return [{
        kind: "paragraph",
        text: [text(block.label), ...block.items.map((item, i) => `${i + 1}. ${text(item.title)} — ${text(item.text)}`)].join("\n"),
      }];
    case "widget":
      // Interactive panels (cookie choices) have no printed form.
      return [];
  }
}

/**
 * The document's content as template blocks: the introduction, then each part
 * as a heading and each section as a numbered clause, as on the page.
 */
export function legalDocumentBlocks(doc: LegalDocument, lang: TermsLang, t: Translate): DocumentBlock[] {
  const toSupply = t("documents.terms.toSupply");
  const out: DocumentBlock[] = [
    { kind: "paragraph", text: plainText(doc.intro[lang], toSupply) },
    ...(doc.lead ?? []).flatMap((block) => blockToDocument(block, lang, t)),
  ];
  let part: string | undefined;
  doc.sections.forEach((section, index) => {
    const partTitle = section.part?.[lang];
    if (partTitle && partTitle !== part) {
      part = partTitle;
      out.push({ kind: "heading", text: partTitle });
    }
    const title = plainText(section.title[lang], toSupply);
    out.push({ kind: "heading", level: 2, text: doc.numbered ? `${index + 1}. ${title}` : title });
    for (const block of section.blocks) out.push(...blockToDocument(block, lang, t));
  });
  return out;
}

/** The terms of sale in force (this build's version), filled with the seller's details. */
export function termsOfSaleSource(store: LegalStoreDetails | null): LegalDocument {
  return withStoreDetails(TERMS, store);
}

/** The terms of sale, version `TERMS_OF_SALE_VERSION`, as a document for the PDF template. */
export function termsOfSaleDocument(options: TermsPdfOptions): BusinessDocument {
  const { lang, t, store } = options;
  const doc = termsOfSaleSource(store);
  const seller = store ? store.tradingName.trim() || store.legalName.trim() : "";
  const footer = store
    ? legalFooterLines(
        {
          tradingName: store.tradingName,
          name: store.legalName,
          legalForm: store.legalForm,
          shareCapital: "",
          registrationNumber: store.registrationNumber,
          vatNumber: "",
          address: officeAddress(store, lang),
          email: store.supportEmail,
        },
        t,
      )
    : [];
  const version = options.date(TERMS_OF_SALE_VERSION);
  return {
    lang,
    title: t("documents.terms.title"),
    meta: [
      { label: t("documents.terms.version"), value: version },
      ...(options.reference ? [{ label: t("documents.terms.appliesTo"), value: options.reference }] : []),
    ],
    parties: [],
    blocks: [{ kind: "paragraph", tone: "notice", text: t("documents.terms.intro") }, ...legalDocumentBlocks(doc, lang, t)],
    footer: footer.length ? footer : [doc.title[lang]],
    pageLabel: (page, count) => t("documents.page", { page, count }),
    info: { title: `${t("documents.terms.title")} — ${version}`, author: seller || "Global Toothgems", subject: options.reference },
  };
}

/** "conditions-generales-de-vente-2026-11-09.pdf" / "terms-of-sale-2026-11-09.pdf". */
export function termsOfSaleFileName(t: Translate): string {
  return `${t("documents.terms.fileName")}-${TERMS_OF_SALE_VERSION}.pdf`;
}

export { TERMS_OF_SALE_VERSION };
