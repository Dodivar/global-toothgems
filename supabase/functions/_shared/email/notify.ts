/**
 * What happens after an order becomes paid, called by the two paths that pay
 * one (stripe-webhook, and create-checkout-session for an order fully covered
 * by gift cards).
 *
 * It never throws: the payment is already recorded and an e-mail problem must
 * not turn a paid order into a failed webhook or a failed checkout. A failure
 * is logged and kept in `email_log` (status failed) for the team.
 * Without RESEND_API_KEY (e-mail not set up yet) it does nothing, quietly.
 */
import { serviceClient } from "../clients.ts";
import { emailDepsFromEnv } from "./mod.ts";
import { sendOrderConfirmation, supabaseOrderSource } from "./orders.ts";

export type Logger = (message: string, detail?: unknown) => void;

export function emailConfigured(): boolean {
  return !!Deno.env.get("RESEND_API_KEY")?.trim();
}

export async function notifyOrderPaid(orderId: string, log: Logger): Promise<void> {
  if (!emailConfigured()) {
    log("e-mail not configured (RESEND_API_KEY): order confirmation skipped", orderId);
    return;
  }
  try {
    const result = await sendOrderConfirmation(emailDepsFromEnv(), supabaseOrderSource(serviceClient()), orderId);
    if (result.status === "failed" || result.status === "invalid" || result.status === "template_missing") {
      log(`order confirmation not sent (${result.status})`, { orderId, ...result });
    }
  } catch (error) {
    log("order confirmation crashed", error instanceof Error ? error.message : error);
  }
}
