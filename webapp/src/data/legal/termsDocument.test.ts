import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import fr from "../../i18n/locales/fr.json";
import type { Translate } from "../../lib/documents/legal";
import { layoutDocument, renderDocument } from "../../lib/documents/template";
import type { LegalStoreDetails } from "./storeFill";
import { TERMS, TERMS_OF_SALE_VERSION } from "./terms";
import { legalDocumentBlocks, plainText, termsOfSaleDocument, termsOfSaleFileName, type TermsLang } from "./termsDocument";

function translator(messages: unknown): Translate {
  return (key, params = {}) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
    if (typeof value !== "string") throw new Error(`missing key ${key}`);
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name]));
  };
}

const T = { fr: translator(fr), en: translator(en) };
const dateIn = (lang: TermsLang) => (iso: string) =>
  new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-IE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));

const store: LegalStoreDetails = {
  tradingName: "PIMP TON SMILE",
  legalName: "Ada Test",
  legalForm: "Entrepreneur individuel (EI)",
  publisherName: "Studio Test",
  publisherLegalName: "",
  registrationNumber: "SIREN 123 456 789",
  supportEmail: "support@example.com",
  country: "FR",
  address1: "1 rue Fictive",
  address2: "",
  postalCode: "75004",
  city: "Paris",
  region: "",
};

/** Every text drawn on the PDF's pages, in order. */
function drawnText(lang: TermsLang, reference?: string): string {
  const doc = termsOfSaleDocument({ lang, t: T[lang], date: dateIn(lang), store, reference });
  return layoutDocument(doc)
    .flat()
    .flatMap((op) => (op.kind === "text" ? [op.text] : []))
    .join(" ");
}

describe("terms of sale version", () => {
  it("changes with the text (bump TERMS_OF_SALE_VERSION, then record the new fingerprint here)", () => {
    // The fingerprint of the text published as version TERMS_OF_SALE_VERSION. A change to
    // terms.ts or the rules it quotes (policies.ts) without a new version would send customers
    // a PDF whose version no longer identifies its text.
    const fingerprint = createHash("sha256").update(JSON.stringify(TERMS)).digest("hex");
    expect({ version: TERMS_OF_SALE_VERSION, fingerprint }).toEqual({
      version: "2026-11-10",
      fingerprint: "4ebcd6dad79639d360acf2432bb67b9bb7cb2f73f68b73c05ce67d60697abd1e",
    });
  });

  it("is the page's last-updated date, an ISO day", () => {
    expect(TERMS.updated).toBe(TERMS_OF_SALE_VERSION);
    expect(TERMS_OF_SALE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("terms of sale PDF", () => {
  it("is a PDF in the order's language, named after its version", () => {
    for (const lang of ["fr", "en"] as const) {
      const bytes = renderDocument(termsOfSaleDocument({ lang, t: T[lang], date: dateIn(lang), store }));
      expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
      expect(new TextDecoder("latin1").decode(bytes)).toContain(lang === "fr" ? "/Lang <FEFF00660072>" : "/Lang <FEFF0065006E>");
    }
    expect(termsOfSaleFileName(T.fr)).toBe("conditions-generales-de-vente-2026-11-10.pdf");
    expect(termsOfSaleFileName(T.en)).toBe("terms-of-sale-2026-11-10.pdf");
  });

  it("prints the version, the reference, every numbered clause and the seller filled from the store", () => {
    const text = drawnText("fr", "Commande GT-2026-000123");
    expect(text).toContain("CONDITIONS GÉNÉRALES DE VENTE");
    expect(text).toContain("10 novembre 2026");
    expect(text).toContain("Commande GT-2026-000123");
    TERMS.sections.forEach((section, i) => expect(text).toContain(`${i + 1}. ${section.title.fr}`));
    expect(text).toContain("PIMP TON SMILE — Ada Test, Entrepreneur individuel (EI)");
    expect(text).not.toMatch(/\[\[|<<|\*\*/);

    const english = drawnText("en");
    expect(english).toContain("TERMS OF SALE");
    expect(english).toContain("10 November 2026");
    expect(english).toContain(`1. ${TERMS.sections[0].title.en}`);
    expect(english).not.toContain("Conditions générales");
  });

  it("keeps a detail the store has not supplied visible as such", () => {
    const text = layoutDocument(termsOfSaleDocument({ lang: "en", t: T.en, date: dateIn("en"), store: null }))
      .flat()
      .flatMap((op) => (op.kind === "text" ? [op.text] : []))
      .join(" ");
    expect(text).toContain("[Legal name and entity type — to be supplied]");
  });
});

describe("legal page flattening", () => {
  it("reads inline markup as plain text", () => {
    expect(plainText("See the <<legal notice|/mentions-legales>>, **now**, [[!Phone]] and [[Value]].", "to supply")).toBe(
      "See the legal notice, now, [Phone — to supply] and Value.",
    );
  });

  it("gives one heading per part and one numbered clause per section", () => {
    const blocks = legalDocumentBlocks(TERMS, "en", T.en);
    const clauses = blocks.filter((b) => b.kind === "heading" && b.level === 2);
    const parts = new Set(TERMS.sections.map((s) => s.part?.en).filter(Boolean));
    expect(clauses).toHaveLength(TERMS.sections.length);
    expect(blocks.filter((b) => b.kind === "heading" && !b.level)).toHaveLength(parts.size);
  });
});
