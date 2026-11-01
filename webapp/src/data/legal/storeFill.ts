import type { StoreDetails } from "../adminSettings";
import type { Localized } from "../types";
import { countryName } from "../../lib/settingsRules";
import { addressLines } from "../../lib/storeDetails";
import type { LegalDocument } from "./types";

/**
 * Fills the "business information to supply" markers of a static legal page
 * (terms of sale, terms of use) with the details saved in Settings › Store,
 * as the legal notice does. A detail that has not been supplied keeps its
 * marker, so the page still shows what is missing instead of inventing it.
 *
 * The business is named by its trading name ("Pimp son smile"); the legal
 * identity (for an individual entrepreneur, their own name) appears only
 * where the law asks for the seller's identification — the seller clause of
 * the terms of sale —, never put forward (decision 120). Pure.
 */

type Replacements = { fr: Record<string, string>; en: Record<string, string> };

/** "Pimp son smile — Lorine Christin, Entrepreneur individuel (EI)", or what of it is known. */
export function sellerIdentity(store: StoreDetails): string {
  const trading = store.tradingName.trim();
  const legal = store.legalName.trim();
  const who = [legal === trading ? "" : legal, store.legalForm.trim()].filter(Boolean).join(", ");
  return [trading, who].filter(Boolean).join(" — ");
}

/** The name the business is known by on the legal pages: trading name, else legal name. */
export function businessName(store: StoreDetails): string {
  return store.tradingName.trim() || store.legalName.trim();
}

function replacements(store: StoreDetails): Replacements {
  const name = businessName(store);
  const seller = store.legalName.trim() ? sellerIdentity(store) : "";
  const lines = store.address1.trim() ? addressLines(store) : [];
  const office = (lang: "fr" | "en") => (lines.length ? [...lines, countryName(store.country, lang)].join(", ") : "");
  const registration = store.registrationNumber.trim();
  return {
    fr: {
      "[[!Dénomination sociale]]": name,
      "[[!Dénomination et forme juridique]]": seller,
      "[[!Adresse du siège]]": office("fr"),
      "[[!Numéro d’immatriculation]]": registration,
    },
    en: {
      "[[!Legal business name]]": name,
      "[[!Legal name and entity type]]": seller,
      "[[!Registered office address]]": office("en"),
      "[[!Registration number]]": registration,
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
export function withStoreDetails(doc: LegalDocument, store: StoreDetails | null): LegalDocument {
  if (!store) return doc;
  return walk(doc, replacements(store)) as LegalDocument;
}
