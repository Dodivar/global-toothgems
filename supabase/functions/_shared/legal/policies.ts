// Generated from webapp/src/data/legal/policies.ts by webapp/scripts/sync-documents.mjs — edit the source, then run `npm run sync:documents`.
import type { Localized } from "./localized.ts";
import { l } from "./types.ts";

/**
 * The shop's commercial rules, written once and quoted by every page that
 * states them (terms of sale, returns, shipping, FAQ), so two pages can never
 * disagree. Defaults chosen with the owner's go-ahead on 2026-11-08 ("replace
 * what is to be supplied with something workable, I will validate later"),
 * kept to what the shop actually does (see `supabase/README.md`, decision 126).
 */
export const POLICY = {
  /** Withdrawal period offered for goods: the legal one. */
  returnPeriod: l("14 jours à compter de la réception du colis", "14 days from receipt of the parcel"),
  /** Time to send the goods back once the withdrawal is notified (L221-23). */
  returnShipDeadline: l("14 jours", "14 days"),
  preparationTime: l("1 à 3 jours ouvrés", "1 to 3 working days"),
  cancellationStage: l(
    "jusqu’à la remise du colis au transporteur",
    "until the parcel is handed to the carrier",
  ),
  responseTime: l("2 jours ouvrés (du lundi au vendredi)", "2 working days (Monday to Friday)"),
  refundProcessing: l(
    "5 jours ouvrés après réception et contrôle du retour",
    "5 working days after the return is received and checked",
  ),
  returnCosts: l(
    "les frais de renvoi sont à votre charge",
    "the cost of sending the goods back is yours",
  ),
  damageReport: l("3 jours ouvrés suivant la réception", "3 working days of receipt"),
  courseAccess: l("sans limite de durée", "with no time limit"),
  currency: l("euros (EUR), toutes zones de livraison confondues", "euros (EUR), whatever the delivery zone"),
  paymentMethods: l(
    "carte bancaire (Visa, Mastercard, American Express…) et, selon votre appareil et votre pays, les autres moyens proposés par le formulaire de paiement (par exemple Apple Pay ou Google Pay)",
    "bank card (Visa, Mastercard, American Express…) and, depending on your device and country, the other methods offered by the payment form (for example Apple Pay or Google Pay)",
  ),
  carriers: l(
    "La Poste (Colissimo), Chronopost ou GLS, selon la destination et le mode choisi",
    "La Poste (Colissimo), Chronopost or GLS, depending on the destination and the method chosen",
  ),
  excludedGoods: l(
    "les gems, adhésifs, composites et autres produits de pose destinés à la bouche dont l’emballage scellé a été ouvert après la livraison",
    "gems, adhesives, composites and other application products meant for the mouth whose sealed packaging has been opened after delivery",
  ),
};

type PolicyKey = keyof typeof POLICY;
type PolicyValues = Record<PolicyKey, string>;

const values = (lang: "fr" | "en"): PolicyValues =>
  Object.fromEntries(Object.entries(POLICY).map(([key, value]) => [key, value[lang]])) as PolicyValues;

/** Bilingual text quoting the rules: `lp((p) => \`… ${p.returnPeriod} …\`, (p) => …)`. */
export function lp(fr: (p: PolicyValues) => string, en: (p: PolicyValues) => string): Localized {
  return l(fr(values("fr")), en(values("en")));
}
