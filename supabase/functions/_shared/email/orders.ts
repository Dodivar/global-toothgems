/**
 * Order confirmation e-mail: sent once an order is paid, whichever path paid it
 * (Stripe webhook, or an order fully covered by gift cards at checkout).
 *
 * The event key is the order, so the webhook being replayed, or both paths
 * firing, still sends one e-mail (see send.ts / email_log).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { type AttachedDocument, type InvoiceSource, orderInvoice } from "./invoicePdf.ts";
import { type OrderSnapshot, orderConfirmationContent } from "./orderContent.ts";
import { type EmailDeps, type SendResult, sendTemplatedEmail } from "./send.ts";

export interface OrderMailRow extends OrderSnapshot {
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

/**
 * The invoice the payment issued travels as a PDF attachment, for every buyer
 * (a guest has no other way to get it). Drawing it never blocks the e-mail: a
 * failure is logged and the confirmation leaves without it.
 */
export async function sendOrderConfirmation(
  deps: EmailDeps,
  source: OrderMailSource,
  orderId: string,
  options: { invoices?: InvoiceSource; log?: (message: string, detail?: unknown) => void } = {},
): Promise<OrderConfirmationResult> {
  const order = await source.loadOrder(orderId);
  if (!order) return { status: "skipped", reason: "order_not_found" };
  if (order.paymentStatus !== "paid") return { status: "skipped", reason: "not_paid" };

  let invoice: AttachedDocument | null = null;
  if (options.invoices) {
    try {
      invoice = await orderInvoice(options.invoices, order.id, order.locale);
    } catch (error) {
      options.log?.("invoice PDF not attached", { orderId, error: error instanceof Error ? error.message : error });
    }
  }

  return await sendTemplatedEmail(deps, {
    templateKey: "order_confirmation",
    to: order.email,
    locale: order.locale,
    variables: { first_name: order.firstName, order_number: order.orderNumber },
    eventKey: `order_confirmation:${order.id}`,
    orderId: order.id,
    attachments: invoice ? [invoice.attachment] : undefined,
    // Labels follow the language of the template actually found, like the body.
    content: (locale) => orderConfirmationContent(order, locale, deps.layout.siteUrl, invoice?.number),
  });
}

const ORDER_COLUMNS = [
  "id, order_number, user_id, customer_email, locale, payment_status, paid_at, currency",
  "subtotal_amount, discount_amount, shipping_amount, tax_amount, total_amount, gift_card_amount, amount_due",
  "prices_include_tax, shipping_method_name, billing_address, shipping_address",
  "order_items(product_name, variant_name, quantity, subtotal_amount, created_at)",
].join(", ");

/** numeric columns arrive as strings: a display value only, never used for arithmetic. */
const amount = (value: unknown): number => Number(value ?? 0);

export function supabaseOrderSource(db: SupabaseClient): OrderMailSource {
  return {
    async loadOrder(orderId) {
      const { data, error } = await db.from("orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
      if (error) throw new Error(`order lookup failed: ${error.message}`);
      if (!data) return null;
      // deno-lint-ignore no-explicit-any
      const row = data as any;
      const billing = (row.billing_address ?? {}) as { first_name?: unknown };
      const items = ((row.order_items ?? []) as Array<Record<string, unknown>>)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return {
        id: row.id,
        orderNumber: row.order_number,
        email: row.customer_email,
        locale: row.locale,
        firstName: typeof billing.first_name === "string" ? billing.first_name : "",
        paymentStatus: row.payment_status,
        userId: row.user_id,
        currency: row.currency,
        paidAt: row.paid_at,
        subtotal: amount(row.subtotal_amount),
        discount: amount(row.discount_amount),
        shipping: amount(row.shipping_amount),
        tax: amount(row.tax_amount),
        total: amount(row.total_amount),
        giftCard: amount(row.gift_card_amount),
        amountDue: amount(row.amount_due),
        pricesIncludeTax: row.prices_include_tax !== false,
        shippingMethodName: row.shipping_method_name,
        shippingAddress: row.shipping_address,
        lines: items.map((item) => ({
          productName: String(item.product_name ?? ""),
          variantName: typeof item.variant_name === "string" && item.variant_name ? item.variant_name : null,
          quantity: Number(item.quantity ?? 1),
          subtotal: amount(item.subtotal_amount),
        })),
      };
    },
  };
}
