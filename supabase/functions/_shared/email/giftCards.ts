/**
 * Gift card delivery: e-mails the code to the recipient once the card is active
 * and its delivery date (if any) has come.
 *
 * Used by the `deliver-gift-cards` Edge Function (cron, every few minutes: scheduled
 * deliveries and retries) and, right after payment, by `notifyOrderPaid` for the
 * cards of that order.
 *
 * Exactly-once: the e-mail is keyed `gift_card:<id>` in email_log, claimed
 * atomically before sending. The card's own `delivery_status` is only recorded
 * afterwards (`record_gift_card_delivery`); if that step failed once, the next
 * run finds the e-mail already sent and just records it.
 * The code is read through a service-role-only function, put in the e-mail and
 * never logged.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { giftCardVisual } from "./components.ts";
import { formatAmount } from "./format.ts";
import { type EmailDeps, sendTemplatedEmail } from "./send.ts";

export interface DueGiftCard {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  senderName: string | null;
  message: string | null;
  /** The design the buyer picked (`gift_cards.design`). */
  design: string;
  currency: string;
  amount: number;
  expiresAt: string | null;
  orderId: string | null;
  /** The buyer's language (the order's); the default language when there is no order. */
  locale: string;
}

export interface GiftCardSource {
  /** Active cards not yet delivered whose delivery date has come, oldest first. */
  listDue(options: { orderId?: string; limit: number; now: Date }): Promise<DueGiftCard[]>;
  codeFor(giftCardId: string): Promise<string | null>;
  recordSent(giftCardId: string): Promise<void>;
}

export interface DeliveryReport {
  examined: number;
  sent: number;
  /** E-mail was already out (an earlier run); the card's status was brought up to date. */
  healed: number;
  /** Being sent by another run right now. */
  inFlight: number;
  /** Failed; will be retried by the next run. */
  failed: number;
  /** Failed too many times: left for the team (email_log status failed). */
  gaveUp: number;
  /** Expired, no code, no template or an unusable address/render. */
  skipped: number;
}

const SENT_STATUSES = new Set(["sent", "delivered", "opened", "bounced", "complained"]);

const ANONYMOUS_SENDER: Record<string, string> = { fr: "Quelqu’un", en: "Someone" };
const NO_EXPIRY: Record<string, string> = { fr: "aucune", en: "none" };
// Same wording as the storefront's card preview (promo.visual.*).
const CARD_LABEL: Record<string, string> = { fr: "Carte cadeau", en: "Gift card" };
const FOR: Record<string, string> = { fr: "Pour {name}", en: "For {name}" };
const FROM: Record<string, string> = { fr: "De la part de {name}", en: "From {name}" };

function localised(map: Record<string, string>, locale: string): string {
  return map[locale] ?? map.en;
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export async function deliverGiftCards(
  deps: EmailDeps,
  source: GiftCardSource,
  options: { orderId?: string; limit?: number; now?: Date; log?: (message: string, detail?: unknown) => void } = {},
): Promise<DeliveryReport> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});
  const report: DeliveryReport = { examined: 0, sent: 0, healed: 0, inFlight: 0, failed: 0, gaveUp: 0, skipped: 0 };

  const cards = await source.listDue({ orderId: options.orderId, limit: options.limit ?? 25, now });
  for (const card of cards) {
    report.examined++;
    if (card.expiresAt && new Date(card.expiresAt) <= now) {
      report.skipped++;
      continue;
    }
    try {
      const code = await source.codeFor(card.id);
      if (!code) {
        log("gift card has no deliverable code", card.id);
        report.skipped++;
        continue;
      }
      const result = await sendTemplatedEmail(deps, {
        templateKey: "gift_card_delivery",
        to: card.recipientEmail,
        locale: card.locale,
        variables: {
          sender_name: card.senderName?.trim() || localised(ANONYMOUS_SENDER, card.locale),
          amount: formatAmount(card.amount, card.currency, card.locale),
          message: card.message?.trim() ?? "",
          code,
          expires_on: card.expiresAt ? formatDate(card.expiresAt, card.locale) : localised(NO_EXPIRY, card.locale),
          shop_url: `${deps.layout.siteUrl}/${card.locale === "en" ? "en" : "fr"}`,
        },
        // The card as the buyer composed it (design, names, message), like the checkout preview.
        content: (locale) => ({
          lead: [
            giftCardVisual({
              design: card.design,
              amount: formatAmount(card.amount, card.currency, locale),
              label: localised(CARD_LABEL, locale),
              recipient: card.recipientName ? localised(FOR, locale).replace("{name}", card.recipientName.trim()) : undefined,
              sender: card.senderName ? localised(FROM, locale).replace("{name}", card.senderName.trim()) : undefined,
              message: card.message ?? undefined,
            }),
          ],
        }),
        eventKey: `gift_card:${card.id}`,
        giftCardId: card.id,
        orderId: card.orderId ?? undefined,
      });

      switch (result.status) {
        case "sent":
          await source.recordSent(card.id);
          report.sent++;
          break;
        case "duplicate":
          if (SENT_STATUSES.has(result.previous)) {
            await source.recordSent(card.id);
            report.healed++;
          } else if (result.previous === "failed") report.gaveUp++;
          else report.inFlight++;
          break;
        case "failed":
          log("gift card e-mail failed", { giftCardId: card.id, error: result.error, retryable: result.retryable });
          report.failed++;
          break;
        default:
          log(`gift card e-mail ${result.status}`, { giftCardId: card.id });
          report.skipped++;
      }
    } catch (error) {
      // One card never stops the others; the next run tries again.
      log("gift card delivery crashed", { giftCardId: card.id, error: error instanceof Error ? error.message : error });
      report.failed++;
    }
  }
  return report;
}

export function supabaseGiftCardSource(db: SupabaseClient): GiftCardSource {
  return {
    async listDue({ orderId, limit, now }) {
      let query = db
        .from("gift_cards")
        .select("id, recipient_email, recipient_name, sender_name, message, design, currency, initial_amount, expires_at, order_id, orders(locale)")
        .eq("state", "active")
        .in("delivery_status", ["pending", "scheduled"])
        .or(`deliver_at.is.null,deliver_at.lte.${now.toISOString()}`)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (orderId) query = query.eq("order_id", orderId);
      const { data, error } = await query;
      if (error) throw new Error(`gift card lookup failed: ${error.message}`);
      return (data ?? []).map((row: Record<string, unknown>) => {
        const order = row.orders as { locale?: string } | { locale?: string }[] | null;
        const locale = (Array.isArray(order) ? order[0]?.locale : order?.locale) ?? "fr";
        return {
          id: row.id as string,
          recipientEmail: row.recipient_email as string,
          recipientName: (row.recipient_name as string | null) ?? null,
          senderName: (row.sender_name as string | null) ?? null,
          message: (row.message as string | null) ?? null,
          design: (row.design as string | null) ?? "sparkle",
          currency: row.currency as string,
          amount: Number(row.initial_amount),
          expiresAt: (row.expires_at as string | null) ?? null,
          orderId: (row.order_id as string | null) ?? null,
          locale,
        };
      });
    },

    async codeFor(giftCardId) {
      const { data, error } = await db.rpc("gift_card_code_for_delivery", { p_gift_card_id: giftCardId });
      if (error) throw new Error(`gift_card_code_for_delivery failed: ${error.message}`);
      return typeof data === "string" ? data : null;
    },

    async recordSent(giftCardId) {
      const { error } = await db.rpc("record_gift_card_delivery", { p_gift_card_id: giftCardId, p_status: "sent" });
      if (error) throw new Error(`record_gift_card_delivery failed: ${error.message}`);
    },
  };
}
