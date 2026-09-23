import type { Localized } from "../types";
import { LEGAL_PATHS } from "./routes";
import { l } from "./types";

/**
 * Pre-launch checklist for payments and compliance — an internal review aid.
 *
 * It lists what has to be true before Stripe goes live and the site takes
 * money: information a payment provider, a customer and the law all expect to
 * find. It is shown only with review annotations on and is never part of a
 * customer-facing page. Ticking an item records nothing but the reviewer's own
 * progress in their browser.
 */
export interface ChecklistItem {
  id: string;
  label: Localized;
  /** Where the item is addressed in the prototype, if anywhere. */
  to?: string;
}

export const LAUNCH_CHECKLIST: ChecklistItem[] = [
  { id: "identity", label: l("Identité légale de l’entreprise complétée", "Legal business identity completed"), to: LEGAL_PATHS.legalNotice },
  { id: "terms", label: l("Conditions générales de vente publiées", "Terms of Sale published"), to: LEGAL_PATHS.terms },
  { id: "privacy", label: l("Politique de confidentialité publiée", "Privacy Policy published"), to: LEGAL_PATHS.privacy },
  { id: "consent", label: l("Consentement cookies implémenté si nécessaire", "Cookie consent implemented where required"), to: LEGAL_PATHS.cookies },
  { id: "refunds", label: l("Politique de remboursement / d’annulation clairement accessible", "Refund / cancellation policy clearly accessible"), to: LEGAL_PATHS.returns },
  { id: "support", label: l("Contact du service client disponible", "Customer support contact available"), to: LEGAL_PATHS.contact },
  { id: "shipping", label: l("Informations de livraison disponibles", "Shipping information available"), to: LEGAL_PATHS.shipping },
  { id: "descriptions", label: l("Descriptions produits complètes", "Product descriptions complete"), to: "/boutique" },
  { id: "prices", label: l("Prix et taxes applicables clairement affichés", "Prices and applicable taxes clearly displayed"), to: "/panier" },
  { id: "methods", label: l("Moyens de paiement clairement indiqués", "Payment methods clearly communicated"), to: `${LEGAL_PATHS.terms}#payment-methods` },
  { id: "stripe", label: l("Informations d’intégration Stripe vérifiées", "Stripe integration information verified"), to: `${LEGAL_PATHS.terms}#stripe` },
  { id: "address", label: l("Adresse de l’entreprise vérifiée", "Business address verified"), to: `${LEGAL_PATHS.legalNotice}#publisher` },
  { id: "return-procedure", label: l("Procédure de retour / remboursement vérifiée", "Return/refund procedure verified"), to: `${LEGAL_PATHS.returns}#how` },
];
