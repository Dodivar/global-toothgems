/** Test fixtures for the terms of sale attached to the contract confirmations (decision 130). */
import type { LegalStoreDetails } from "../legal/storeFill.ts";
import { contractTermsForEmail, type TermsOptions, type TermsProvider } from "./termsPdf.ts";

export const LEGAL_STORE: LegalStoreDetails = {
  tradingName: "PIMP TON SMILE",
  legalName: "Ada Test",
  legalForm: "Entrepreneur individuel (EI)",
  publisherName: "Studio Test",
  publisherLegalName: "",
  publisherLegalForm: "",
  publisherRegistrationNumber: "",
  publisherAddress: "",
  registrationNumber: "SIREN 123 456 789",
  supportEmail: "support@example.com",
  country: "FR",
  address1: "1 rue Fictive",
  address2: "",
  postalCode: "75004",
  city: "Paris",
  region: "",
};

/** The real provider on a fixed store, recording what it was asked for. */
export function testTermsProvider(options: TermsOptions = {}): { terms: TermsProvider; asked: { locale: string; reference: string }[] } {
  const asked: { locale: string; reference: string }[] = [];
  return {
    asked,
    terms: (locale, reference, kind = "sale") => {
      asked.push({ locale, reference });
      return Promise.resolve(contractTermsForEmail(kind, LEGAL_STORE, locale, reference, options));
    },
  };
}

/** A PDF renderer that always fails, as a template bug would. */
export const failingRender = (): Uint8Array => {
  throw new Error("glyph table broken");
};
