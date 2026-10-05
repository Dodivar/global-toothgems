/**
 * What happens after an order becomes paid, called by the two paths that pay
 * one (stripe-webhook, and create-checkout-session for an order fully covered
 * by gift cards): the confirmation e-mail, then the delivery of the gift cards
 * bought in the order.
 *
 * It never throws: the payment is already recorded and an e-mail problem must
 * not turn a paid order into a failed webhook or a failed checkout. A failure
 * is logged and kept in `email_log` (status failed) for the team.
 * Without RESEND_API_KEY (e-mail not set up yet) it does nothing, quietly: the
 * gift cards stay due and are delivered by the cron once e-mail is configured.
 */
import { serviceClient } from "../clients.ts";
import { emailDepsFromEnv } from "./mod.ts";
import { deliverGiftCards, supabaseGiftCardSource } from "./giftCards.ts";
import { sendOrderConfirmation, supabaseOrderSource } from "./orders.ts";
import type { EmailDeps } from "./send.ts";

export type Logger = (message: string, detail?: unknown) => void;

export function emailConfigured(): boolean {
  return !!Deno.env.get("RESEND_API_KEY")?.trim();
}

export async function notifyOrderPaid(orderId: string, log: Logger): Promise<void> {
  if (!emailConfigured()) {
    log("e-mail not configured (RESEND_API_KEY): order e-mails skipped", orderId);
    return;
  }
  let deps: EmailDeps;
  try {
    deps = emailDepsFromEnv();
  } catch (error) {
    log("e-mail misconfigured", error instanceof Error ? error.message : error);
    return;
  }
  const db = serviceClient();

  // Independent steps: a failing confirmation must not hold back the gift cards, nor the reverse.
  try {
    const result = await sendOrderConfirmation(deps, supabaseOrderSource(db), orderId);
    if (result.status === "failed" || result.status === "invalid" || result.status === "template_missing") {
      log(`order confirmation not sent (${result.status})`, { orderId, ...result });
    }
  } catch (error) {
    log("order confirmation crashed", error instanceof Error ? error.message : error);
  }

  try {
    // Cards bought in this order are active as soon as it is paid; scheduled ones wait for the cron.
    await deliverGiftCards(deps, supabaseGiftCardSource(db), { orderId, log });
  } catch (error) {
    log("gift card delivery crashed", error instanceof Error ? error.message : error);
  }
}
