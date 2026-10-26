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
    invoice: "Facture (en pièce jointe)",
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
    invoice: "Invoice (attached)",
  },
} as const;

/** A withdrawal acknowledged (decision 95): what was paid, kept for the days used, refunded. */
export interface StudioWithdrawalMail {
  plan: StudioPlan;
  requestedAt: string;
  usedDays: number;
  periodDays: number;
  /** Decimal major units, as Postgres returns them. */
  paidAmount: number;
  usedAmount: number;
  refundAmount: number;
  currency: string;
}

const WITHDRAWAL_LABELS = {
  fr: {
    title: "Votre remboursement",
    date: "Rétractation reçue le",
    paid: "Payé à la souscription",
    used: (days: number, total: number) => `Jours utilisés (${days} sur ${total})`,
    refund: "Remboursé",
    noRefund: "Aucun montant n’est à rembourser : la période payée a été entièrement utilisée.",
    account: "Mon espace Studio",
    creditNote: "Avoir (en pièce jointe)",
  },
  en: {
    title: "Your refund",
    date: "Withdrawal received on",
    paid: "Paid when subscribing",
    used: (days: number, total: number) => `Days used (${days} of ${total})`,
    refund: "Refunded",
    noRefund: "Nothing is left to refund: the paid period was fully used.",
    account: "My Studio page",
    creditNote: "Credit note (attached)",
  },
} as const;

export function studioWithdrawalContent(mail: StudioWithdrawalMail, locale: string, siteUrl: string, creditNoteNumber?: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = WITHDRAWAL_LABELS[lang];
  const money = (amount: number) => formatAmount(amount, mail.currency, lang);
  const blocks: Block[] = [
    details({
      title: l.title,
      rows: [
        { label: l.date, value: dateOf(mail.requestedAt, lang) },
        { label: l.paid, value: money(mail.paidAmount) },
        { label: l.used(mail.usedDays, mail.periodDays), value: `− ${money(mail.usedAmount)}` },
        { label: l.refund, value: money(mail.refundAmount) },
        ...(creditNoteNumber ? [{ label: l.creditNote, value: creditNoteNumber }] : []),
      ],
    }),
  ];
  if (mail.refundAmount === 0) blocks.push(notice({ tone: "info", title: l.noRefund }));
  return {
    eyebrow: LABELS[lang].eyebrow,
    primaryAction: { label: l.account, url: `${siteUrl.replace(/\/+$/, "")}/compte/studio` },
    blocks,
  };
}

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

export function studioSubscriptionContent(mail: StudioSubscriptionMail, locale: string, siteUrl: string, invoiceNumber?: string): EmailContent {
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
        ...(invoiceNumber ? [{ label: l.invoice, value: invoiceNumber }] : []),
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

/**
 * A Studio invoice (renewal, plan change) or a withdrawal's credit note sent on
 * its own (decision 115): the document travels as a PDF; the e-mail names it.
 */
export interface StudioDocumentMail {
  kind: "invoice" | "creditNote";
  plan: StudioPlan;
  number: string;
}

const DOCUMENT_LABELS = {
  fr: { title: "Votre document", invoice: "Facture", creditNote: "Avoir", plan: "Formule" },
  en: { title: "Your document", invoice: "Invoice", creditNote: "Credit note", plan: "Plan" },
} as const;

export function studioDocumentContent(mail: StudioDocumentMail, locale: string, siteUrl: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = DOCUMENT_LABELS[lang];
  return {
    eyebrow: LABELS[lang].eyebrow,
    primaryAction: { label: WITHDRAWAL_LABELS[lang].account, url: `${siteUrl.replace(/\/+$/, "")}/compte/studio` },
    blocks: [
      details({
        title: l.title,
        rows: [
          { label: l[mail.kind], value: mail.number },
          { label: l.plan, value: studioPlanName(mail.plan, lang) },
        ],
      }),
    ],
  };
}
