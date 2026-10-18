/**
 * The layout content of the 3D Studio subscription confirmation (decision 94 (a)):
 * the subscription as label / value rows, then — word for word, in the version
 * the member accepted — the request for immediate access ticked before paying.
 * That restatement is the durable confirmation L221-25 asks for, so it comes
 * from the code (`STUDIO_WITHDRAWAL_CONSENT`), never from the staff-editable
 * template. Pure; labels are fr/en, anything else falls back to English.
 */
import { STUDIO_WITHDRAWAL_CONSENT, type StudioInterval, type StudioPlan } from "../studioBilling.ts";
import { type Block, details, notice } from "./components.ts";
import { formatAmount } from "./format.ts";
import { chromeLocale } from "./layout.ts";
import type { EmailContent } from "./render.ts";

export interface StudioSubscriptionMail {
  plan: StudioPlan;
  interval: StudioInterval;
  /** First payment, VAT included, decimal major units as Postgres returns them. */
  amount: number;
  currency: string;
  /** `consent_records.policy_version` of the request the member accepted. */
  consentVersion: string;
  consentedAt: string;
}

const PLAN_NAMES = {
  fr: { essential: "Essentiel", artist: "Artiste", atelier: "Atelier" },
  en: { essential: "Essential", artist: "Artist", atelier: "Atelier" },
} as const;

const LABELS = {
  fr: {
    eyebrow: "Studio 3D",
    summary: "Votre abonnement",
    plan: "Formule",
    billing: "Facturation",
    month: "mensuelle",
    year: "annuelle",
    firstPayment: "Premier paiement",
    consentTitle: "Votre demande d’accès immédiat",
    consentOn: (date: string) => `Acceptée le ${date} avant le paiement :`,
    open: "Ouvrir le Studio",
    manage: "Gérer mon abonnement",
  },
  en: {
    eyebrow: "3D Studio",
    summary: "Your subscription",
    plan: "Plan",
    billing: "Billing",
    month: "monthly",
    year: "yearly",
    firstPayment: "First payment",
    consentTitle: "Your request for immediate access",
    consentOn: (date: string) => `Accepted on ${date}, before paying:`,
    open: "Open the Studio",
    manage: "Manage my subscription",
  },
} as const;

export const studioPlanName = (plan: StudioPlan, locale: string) => PLAN_NAMES[chromeLocale(locale)][plan];

/**
 * The sentence of the version the member accepted. One version exists; a new
 * wording keeps the old ones here, so an e-mail always quotes what was ticked.
 */
const ACCEPTED: Record<string, { fr: string; en: string }> = {
  [STUDIO_WITHDRAWAL_CONSENT.version]: STUDIO_WITHDRAWAL_CONSENT.text,
};

function dateOf(iso: string, locale: "fr" | "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "Europe/Paris" }).format(date);
}

export function studioSubscriptionContent(mail: StudioSubscriptionMail, locale: string, siteUrl: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const site = siteUrl.replace(/\/+$/, "");
  const blocks: Block[] = [
    details({
      title: l.summary,
      rows: [
        { label: l.plan, value: studioPlanName(mail.plan, lang) },
        { label: l.billing, value: l[mail.interval] },
        { label: l.firstPayment, value: formatAmount(mail.amount, mail.currency, lang) },
      ],
    }),
  ];
  const accepted = ACCEPTED[mail.consentVersion]?.[lang];
  if (accepted) {
    const quoted = lang === "fr" ? `« ${accepted} »` : `“${accepted}”`;
    blocks.push(notice({ tone: "info", title: l.consentTitle, body: `${l.consentOn(dateOf(mail.consentedAt, lang))} ${quoted}` }));
  }
  return {
    eyebrow: l.eyebrow,
    primaryAction: { label: l.open, url: `${site}/studio-3d/atelier` },
    secondaryAction: { label: l.manage, url: `${site}/compte/studio` },
    blocks,
  };
}
