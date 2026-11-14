import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import fr from "../../i18n/locales/fr.json";
import type { Translate } from "../../lib/documents/legal";
import { layoutDocument, renderDocument } from "../../lib/documents/template";
import type { LegalStoreDetails } from "./storeFill";
import { STUDIO_TERMS, STUDIO_TERMS_VERSION } from "./studioTerms";
import { TERMS, TERMS_OF_SALE_VERSION } from "./terms";
import {
  contractTermsFileName,
  legalDocumentBlocks,
  plainText,
  studioTermsDocument,
  termsOfSaleDocument,
  termsOfSaleFileName,
  type TermsLang,
} from "./termsDocument";

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
  publisherLegalName: "Bob Test EI",
  publisherLegalForm: "Entreprise individuelle (EI)",
  publisherRegistrationNumber: "SIRET 987 654 321 00010",
  publisherAddress: "2 rue Fictive, 67000 Strasbourg, France",
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
      version: "2026-11-12",
      fingerprint: "34b9f3045a8e7a2250d569d2dd0e1b072afe607944719477d6feda4e4583e9a4",
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
    expect(termsOfSaleFileName(T.fr)).toBe("conditions-generales-de-vente-2026-11-12.pdf");
    expect(termsOfSaleFileName(T.en)).toBe("terms-of-sale-2026-11-12.pdf");
  });

  it("prints the version, the reference, every numbered clause and the seller filled from the store", () => {
    const text = drawnText("fr", "Commande GT-2026-000123");
    expect(text).toContain("CONDITIONS GÉNÉRALES DE VENTE");
    expect(text).toContain("12 novembre 2026");
    expect(text).toContain("Commande GT-2026-000123");
    TERMS.sections.forEach((section, i) => expect(text).toContain(`${i + 1}. ${section.title.fr}`));
    expect(text).toContain("PIMP TON SMILE — Ada Test, Entrepreneur individuel (EI)");
    expect(text).not.toMatch(/\[\[|<<|\*\*/);

    const english = drawnText("en");
    expect(english).toContain("TERMS OF SALE");
    expect(english).toContain("12 November 2026");
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

// The 3D Studio is sold by the website publisher, under terms of its own (decision 135).
function studioText(lang: TermsLang, reference?: string): string {
  const doc = studioTermsDocument({ lang, t: T[lang], date: dateIn(lang), store, reference });
  return layoutDocument(doc)
    .flat()
    .flatMap((op) => (op.kind === "text" ? [op.text] : []))
    .join(" ");
}

describe("3D Studio subscription terms version", () => {
  it("changes with the text (bump STUDIO_TERMS_VERSION, then record the new fingerprint here)", () => {
    const fingerprint = createHash("sha256").update(JSON.stringify(STUDIO_TERMS)).digest("hex");
    expect({ version: STUDIO_TERMS_VERSION, fingerprint }).toEqual({
      version: "2026-11-14",
      fingerprint: "a7b129b8e3d1e9aa6dd5c78bdea879163afd71dbe7e981dac7e28de6575cc462",
    });
  });

  it("is the page's last-updated date, an ISO day", () => {
    expect(STUDIO_TERMS.updated).toBe(STUDIO_TERMS_VERSION);
  });
});

describe("3D Studio subscription terms PDF", () => {
  it("is named after its own version", () => {
    expect(contractTermsFileName("studio", T.fr)).toBe("conditions-abonnement-studio-3d-2026-11-14.pdf");
    expect(contractTermsFileName("studio", T.en)).toBe("3d-studio-subscription-terms-2026-11-14.pdf");
  });

  it("names the publisher as the seller, never the shop's seller", () => {
    const text = studioText("fr", "Abonnement Studio 3D — Artiste");
    expect(text).toContain("CONDITIONS GÉNÉRALES D’ABONNEMENT AU STUDIO 3D");
    expect(text).toContain("Abonnement Studio 3D — Artiste");
    STUDIO_TERMS.sections.forEach((section, i) => expect(text).toContain(`${i + 1}. ${section.title.fr}`));
    expect(text).toContain("Studio Test — Bob Test EI, Entreprise individuelle (EI)");
    expect(text).toContain("SIRET 987 654 321 00010");
    expect(text).not.toContain("Ada Test");
    expect(text).not.toContain("SIREN 123 456 789");
    expect(text).not.toMatch(/\[\[|<<|\*\*/);
    expect(studioText("en")).toContain("3D STUDIO SUBSCRIPTION TERMS");
  });

  it("keeps the publisher's details visible as to be supplied when the store is unknown", () => {
    const text = layoutDocument(studioTermsDocument({ lang: "en", t: T.en, date: dateIn("en"), store: null }))
      .flat()
      .flatMap((op) => (op.kind === "text" ? [op.text] : []))
      .join(" ");
    expect(text).toContain("[Studio seller legal name and entity type — to be supplied]");
  });
});

describe("terms of sale and the 3D Studio", () => {
  it("leaves the Studio to its own terms and seller", () => {
    expect(TERMS.sections.map((s) => s.id)).not.toContain("studio");
    const text = drawnText("fr");
    expect(text).toContain("Studio Test — Bob Test EI");
    expect(text).not.toContain("Essential, Artist, Atelier");
  });
});
