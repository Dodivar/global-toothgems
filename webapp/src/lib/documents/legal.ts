/**
 * What every document shares beyond its layout: the translator and formatters
 * it is given, and the legal mentions printed at the foot of each page. Pure
 * and portable (copied to the Edge Functions, `npm run sync:documents`, `scripts/sync-documents.mjs`).
 */

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface DocumentFormat {
  lang: string;
  money: (minor: number, currency: string) => string;
  date: (iso: string) => string;
  country: (code: string) => string;
}

/** What the legal mentions of a document are made of: the store now, or the seller frozen on an invoice. */
export interface LegalIdentity {
  /** The trading name the business presents itself under; empty when it has none. */
  tradingName: string;
  /** The legal name (for an individual entrepreneur, their own name). */
  name: string;
  legalForm: string;
  shareCapital: string;
  registrationNumber: string;
  vatNumber: string;
  address: string;
  email: string;
}

/**
 * The legal mentions printed small at the foot of every page: the trading
 * name, then the legal identity ("Lorine Christin, Entrepreneur individuel
 * (EI)") — present, as the law requires, without being put forward
 * (decision 120) —, registration, VAT number, address and e-mail.
 */
export function legalFooterLines(identity: LegalIdentity, t: Translate): string[] {
  const form = [identity.legalForm, identity.shareCapital && t("documents.footer.capital", { amount: identity.shareCapital })]
    .filter(Boolean)
    .join(" ");
  const trading = identity.tradingName.trim();
  const legal = identity.name.trim() === trading ? "" : identity.name.trim();
  const line1 = [
    trading,
    [legal, form].filter(Boolean).join(", "),
    identity.registrationNumber && t("documents.footer.registration", { number: identity.registrationNumber }),
    identity.vatNumber && t("documents.footer.vat", { number: identity.vatNumber }),
  ].filter(Boolean);
  const line2 = [identity.address, identity.email].filter(Boolean);
  return [line1.join(" · "), line2.join(" · ")].filter(Boolean);
}
