import type { Localized } from "../types";
import { countryName } from "../../lib/countryName";
import type { LegalDocument } from "./types";

/**
 * Fills the "business information to supply" markers of a static legal page
 * (terms of sale, terms of use, privacy policy) with the details saved in Settings › Store,
 * as the legal notice does. A detail that has not been supplied keeps its
 * marker, so the page still shows what is missing instead of inventing it.
 *
 * Two businesses (decision 121): the website publisher, which holds the site
 * and its content (terms of use: publisher, intellectual property), and the
 * seller, named by its trading name ("PIMP TON SMILE"), whose legal identity
 * (for an individual entrepreneur, their own name) appears only where the law
 * asks for the seller's identification — the seller clause of the terms of
 * sale, the data controller of the privacy policy —, never put forward
 * (decision 120). Pure and portable: copied with the terms of sale to the
 * Edge Functions, which fill the PDF sent with each contract confirmation
 * the same way (`npm run sync:documents`).
 */

/** The store details the legal pages quote (a subset of Settings › Store, `StoreDetails`). */
export interface LegalStoreDetails {
  tradingName: string;
  legalName: string;
  legalForm: string;
  publisherName: string;
  publisherLegalName: string;
  registrationNumber: string;
  supportEmail: string;
  country: string;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  region: string;
}

/** The registered office on two lines: street, then postcode, town and region. */
export function addressLines(d: Pick<LegalStoreDetails, "address1" | "address2" | "postalCode" | "city" | "region">): string[] {
  const street = [d.address1, d.address2].map((s) => s.trim()).filter(Boolean).join(", ");
  const town = [d.postalCode, d.city].map((s) => s.trim()).filter(Boolean).join(" ");
  return [street, [town, d.region.trim()].filter(Boolean).join(", ")].filter(Boolean);
}

/** The registered office on one line with its country, in a language; empty when no address is saved. */
export function officeAddress(store: LegalStoreDetails, lang: "fr" | "en"): string {
  const lines = store.address1.trim() ? addressLines(store) : [];
  return lines.length ? [...lines, countryName(store.country, lang)].join(", ") : "";
}

type Replacements = { fr: Record<string, string>; en: Record<string, string> };

/** "PIMP TON SMILE — <legal name>, Entrepreneur individuel (EI)", or what of it is known. */
export function sellerIdentity(store: Pick<LegalStoreDetails, "tradingName" | "legalName" | "legalForm">): string {
  const trading = store.tradingName.trim();
  const legal = store.legalName.trim();
  const who = [legal === trading ? "" : legal, store.legalForm.trim()].filter(Boolean).join(", ");
  return [trading, who].filter(Boolean).join(" — ");
}

/** The website publisher's name: its trading name, else its legal name; empty when not supplied. */
export function publisherName(store: Pick<LegalStoreDetails, "publisherName" | "publisherLegalName">): string {
  return store.publisherName.trim() || store.publisherLegalName.trim();
}

function replacements(store: LegalStoreDetails): Replacements {
  const publisher = publisherName(store);
  const seller = store.legalName.trim() ? sellerIdentity(store) : "";
  const office = (lang: "fr" | "en") => officeAddress(store, lang);
  const registration = store.registrationNumber.trim();
  const support = store.supportEmail.trim();
  return {
    fr: {
      "[[!Dénomination sociale]]": publisher,
      "[[!Dénomination et forme juridique]]": seller,
      "[[!Responsable du traitement]]": seller,
      "[[!Adresse du siège]]": office("fr"),
      "[[!Numéro d’immatriculation]]": registration,
      "[[!E-mail du service client]]": support,
      "[[!E-mail confidentialité]]": support,
    },
    en: {
      "[[!Legal business name]]": publisher,
      "[[!Legal name and entity type]]": seller,
      "[[!Data controller]]": seller,
      "[[!Registered office address]]": office("en"),
      "[[!Registration number]]": registration,
      "[[!Customer service email]]": support,
      "[[!Privacy email]]": support,
    },
  };
}

function fillText(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [marker, value] of Object.entries(map)) {
    if (value) out = out.split(marker).join(value);
  }
  return out;
}

function isLocalized(value: unknown): value is Localized {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Localized).fr === "string" &&
    typeof (value as Localized).en === "string" &&
    Object.keys(value).length === 2
  );
}

function walk(value: unknown, r: Replacements): unknown {
  if (isLocalized(value)) return { fr: fillText(value.fr, r.fr), en: fillText(value.en, r.en) };
  if (Array.isArray(value)) return value.map((item) => walk(item, r));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, r)]));
  }
  return value;
}

/** The page with the store's details in place of their markers; unchanged without details. */
export function withStoreDetails(doc: LegalDocument, store: LegalStoreDetails | null): LegalDocument {
  if (!store) return doc;
  return walk(doc, replacements(store)) as LegalDocument;
}
