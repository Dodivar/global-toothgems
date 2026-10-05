/**
 * Order confirmation e-mail: sent once an order is paid, whichever path paid it
 * (Stripe webhook, or an order fully covered by gift cards at checkout).
 *
 * The event key is the order, so the webhook being replayed, or both paths
 * firing, still sends one e-mail (see send.ts / email_log).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { type EmailDeps, type SendResult, sendTemplatedEmail } from "./send.ts";

export interface OrderMailRow {
  id: string;
  orderNumber: string;
  email: string;
  locale: string;
  /** From the billing address snapshot; may be empty for an unusual snapshot. */
  firstName: string;
  paymentStatus: string;
}

export interface OrderMailSource {
  loadOrder(orderId: string): Promise<OrderMailRow | null>;
}

export type OrderConfirmationResult = SendResult | { status: "skipped"; reason: "order_not_found" | "not_paid" };

export async function sendOrderConfirmation(
  deps: EmailDeps,
  source: OrderMailSource,
  orderId: string,
): Promise<OrderConfirmationResult> {
  const order = await source.loadOrder(orderId);
  if (!order) return { status: "skipped", reason: "order_not_found" };
  if (order.paymentStatus !== "paid") return { status: "skipped", reason: "not_paid" };

  return await sendTemplatedEmail(deps, {
    templateKey: "order_confirmation",
    to: order.email,
    locale: order.locale,
    variables: { first_name: order.firstName, order_number: order.orderNumber },
    eventKey: `order_confirmation:${order.id}`,
    orderId: order.id,
  });
}

export function supabaseOrderSource(db: SupabaseClient): OrderMailSource {
  return {
    async loadOrder(orderId) {
      const { data, error } = await db
        .from("orders")
        .select("id, order_number, customer_email, locale, payment_status, billing_address")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw new Error(`order lookup failed: ${error.message}`);
      if (!data) return null;
      const billing = (data.billing_address ?? {}) as { first_name?: unknown };
      return {
        id: data.id,
        orderNumber: data.order_number,
        email: data.customer_email,
        locale: data.locale,
        firstName: typeof billing.first_name === "string" ? billing.first_name : "",
        paymentStatus: data.payment_status,
      };
    },
  };
}
