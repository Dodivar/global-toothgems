import type { ContactCategory } from "./types";

/**
 * Addresses of the help centre and legal pages.
 *
 * French paths, like the rest of the storefront, with English aliases
 * registered in `App.tsx` so a link written either way lands on the same page.
 * `/conditions-generales` and `/confidentialite` were already the fallbacks of
 * the registration journey's legal links, so they are kept as they were.
 */
export const LEGAL_PATHS = {
  help: "/aide",
  faq: "/aide/faq",
  shipping: "/livraison",
  returns: "/retours-remboursements",
  contact: "/contact",
  legalNotice: "/mentions-legales",
  terms: "/conditions-generales",
  privacy: "/confidentialite",
  cookies: "/cookies",
  about: "/a-propos",
} as const;

export const LEGAL_ALIASES: Record<string, string> = {
  "/help": LEGAL_PATHS.help,
  "/faq": LEGAL_PATHS.faq,
  "/shipping": LEGAL_PATHS.shipping,
  "/returns": LEGAL_PATHS.returns,
  "/legal-notice": LEGAL_PATHS.legalNotice,
  "/terms-of-sale": LEGAL_PATHS.terms,
  "/privacy-policy": LEGAL_PATHS.privacy,
  "/cookie-policy": LEGAL_PATHS.cookies,
  "/about": LEGAL_PATHS.about,
};

/** The query key the contact form reads to pre-select its category. */
export const CONTACT_CATEGORY_PARAM = "sujet";

export function contactHref(category?: ContactCategory) {
  return category ? `${LEGAL_PATHS.contact}?${CONTACT_CATEGORY_PARAM}=${category}` : LEGAL_PATHS.contact;
}
