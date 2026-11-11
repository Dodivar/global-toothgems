/**
 * Shop withdrawal e-mails (decision 131):
 *
 *   order_withdrawal_confirmation   the acknowledgement of receipt on a durable
 *                                   medium (L221-21): what was declared, its date
 *                                   and time, and how to send the goods back.
 *                                   Sent by `order-withdrawal` right after the
 *                                   declaration, else by the `send-pending-emails`
 *                                   sweep (event `order_withdrawal:<id>`).
 *   order_withdrawal_link           the guest's signed link (48 hours), sent by
 *                                   `order-withdrawal` (event `order_withdrawal_link:<link id>`).
 *
 * The declaration's content comes from the database rows, laid out by the code
 * (never by the staff-editable template), like the Studio's acknowledgement.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { type Block, details, notice } from "./components.ts";
import { chromeLocale } from "./layout.ts";
import type { EmailContent } from "./render.ts";
import { type EmailDeps, sendTemplatedEmail, type SendResult } from "./send.ts";

export interface WithdrawalMailItem {
  name: string;
  variant: string | null;
  quantity: number;
}

export interface PendingOrderWithdrawal {
  withdrawalId: string;
  orderId: string;
  orderNumber: string;
  email: string;
  locale: string;
  customerName: string;
  declaredAt: string;
  isMember: boolean;
  items: WithdrawalMailItem[];
  /** The store's address from Settings, or null when it is not filled in. */
  returnAddress: string | null;
}

export interface WithdrawalSource {
  pending(limit: number): Promise<PendingOrderWithdrawal[]>;
}

/** Days the customer has to send the goods back once they withdrew (L221-23). */
export const RETURN_DAYS = 14;

const LABELS = {
  fr: {
    eyebrow: "Rétractation",
    summary: "Votre déclaration",
    order: "Commande",
    declaredAt: "Reçue le",
    name: "Nom",
    item: (variant: string | null) => (variant ? `Article (${variant})` : "Article"),
    returnTitle: "Renvoyer les articles",
    returnBody: (date: string, address: string | null) =>
      `Renvoyez les articles au plus tard le ${date}${address ? `, à l’adresse : ${address}` : ""}. ` +
      "Indiquez votre numéro de commande dans le colis. Les frais de renvoi sont à votre charge ; " +
      "gardez la preuve d’envoi. Les produits pour la bouche doivent nous revenir dans leur emballage scellé.",
    noAddress: "Répondez à cet e-mail pour obtenir l’adresse de retour.",
    refundTitle: "Votre remboursement",
    refundBody:
      "Nous vous remboursons dans les 5 jours ouvrés suivant la réception et le contrôle du retour (au plus tard 14 jours " +
      "après votre rétractation, une fois les articles reçus ou la preuve de leur envoi fournie), sur le moyen de paiement de la commande.",
    account: "Suivre ma commande",
    linkAction: "Me rétracter de la commande",
  },
  en: {
    eyebrow: "Withdrawal",
    summary: "Your declaration",
    order: "Order",
    declaredAt: "Received on",
    name: "Name",
    item: (variant: string | null) => (variant ? `Item (${variant})` : "Item"),
    returnTitle: "Sending the items back",
    returnBody: (date: string, address: string | null) =>
      `Send the items back by ${date}${address ? ` to: ${address}` : ""}. ` +
      "Put your order number in the parcel. The cost of sending them back is yours; keep the proof of posting. " +
      "Products for the mouth must come back in their sealed packaging.",
    noAddress: "Reply to this e-mail to get the return address.",
    refundTitle: "Your refund",
    refundBody:
      "We refund you within 5 working days of receiving and checking the return (at the latest 14 days after your " +
      "withdrawal, once the items are received or proof of posting is provided), to the order's payment method.",
    account: "Follow my order",
    linkAction: "Withdraw from my order",
  },
} as const;

function dateTime(iso: string, lang: "fr" | "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const formatted = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
  return `${formatted} (${lang === "fr" ? "heure de Paris" : "Paris time"})`;
}

/** The last day to send the goods back: the declaration + 14 days, Paris time. */
export function returnByDate(declaredAt: string, lang: "fr" | "en"): string {
  const date = new Date(declaredAt);
  if (Number.isNaN(date.getTime())) return declaredAt;
  date.setUTCDate(date.getUTCDate() + RETURN_DAYS);
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "Europe/Paris" }).format(date);
}

export function withdrawalContent(mail: PendingOrderWithdrawal, locale: string, siteUrl: string): EmailContent {
  const lang = chromeLocale(locale);
  const l = LABELS[lang];
  const blocks: Block[] = [
    details({
      title: l.summary,
      rows: [
        { label: l.order, value: mail.orderNumber },
        { label: l.declaredAt, value: dateTime(mail.declaredAt, lang) },
        { label: l.name, value: mail.customerName },
        ...mail.items.map((item) => ({ label: l.item(item.variant), value: `${item.name} × ${item.quantity}` })),
      ],
    }),
    notice({ tone: "info", title: l.returnTitle, body: l.returnBody(returnByDate(mail.declaredAt, lang), mail.returnAddress) }),
  ];
  if (!mail.returnAddress) blocks.push(notice({ tone: "warning", title: l.noAddress }));
  blocks.push(notice({ tone: "info", title: l.refundTitle, body: l.refundBody }));
  return {
    eyebrow: l.eyebrow,
    ...(mail.isMember ? { primaryAction: { label: l.account, url: `${siteUrl.replace(/\/+$/, "")}/compte/commandes` } } : {}),
    blocks,
  };
}

export function withdrawalLinkContent(url: string, locale: string): EmailContent {
  const l = LABELS[chromeLocale(locale)];
  return { eyebrow: l.eyebrow, primaryAction: { label: l.linkAction, url } };
}

type Log = (message: string, detail?: unknown) => void;

export interface WithdrawalReport {
  examined: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Sends the pending acknowledgements; `only` restricts to one declaration (the one just made). */
export async function sendOrderWithdrawalEmails(
  deps: EmailDeps,
  source: WithdrawalSource,
  options: { limit?: number; log?: Log; only?: string } = {},
): Promise<WithdrawalReport> {
  const log = options.log ?? (() => {});
  const report: WithdrawalReport = { examined: 0, sent: 0, skipped: 0, failed: 0 };
  const rows = (await source.pending(options.limit ?? 25)).filter((r) => !options.only || r.withdrawalId === options.only);
  for (const row of rows) {
    report.examined++;
    let result: SendResult;
    try {
      result = await sendTemplatedEmail(deps, {
        templateKey: "order_withdrawal_confirmation",
        to: row.email,
        locale: row.locale,
        variables: { customer_name: row.customerName, order_number: row.orderNumber },
        eventKey: `order_withdrawal:${row.withdrawalId}`,
        orderId: row.orderId,
        content: (locale) => withdrawalContent(row, locale, deps.layout.siteUrl),
      });
    } catch (error) {
      log("withdrawal e-mail crashed", { id: row.withdrawalId, error: error instanceof Error ? error.message : error });
      report.failed++;
      continue;
    }
    if (result.status === "sent") report.sent++;
    else if (result.status === "failed") {
      log("withdrawal e-mail failed", { id: row.withdrawalId, error: result.error });
      report.failed++;
    } else report.skipped++;
  }
  return report;
}

export function supabaseWithdrawalSource(db: SupabaseClient): WithdrawalSource {
  return {
    async pending(limit) {
      const { data, error } = await db.rpc("pending_order_withdrawal_emails", { p_limit: limit });
      if (error) throw new Error(`pending_order_withdrawal_emails: ${error.message}`);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        withdrawalId: String(row.withdrawal_id),
        orderId: String(row.order_id),
        orderNumber: String(row.order_number),
        email: String(row.email),
        locale: String(row.locale),
        customerName: String(row.customer_name),
        declaredAt: String(row.declared_at),
        isMember: row.is_member === true,
        items: Array.isArray(row.items)
          ? (row.items as Record<string, unknown>[]).map((item) => ({
            name: String(item.name ?? ""),
            variant: typeof item.variant === "string" && item.variant ? item.variant : null,
            quantity: Number(item.quantity ?? 0),
          }))
          : [],
        returnAddress: typeof row.return_address === "string" && row.return_address ? row.return_address : null,
      }));
    },
  };
}
