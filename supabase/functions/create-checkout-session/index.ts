import { courseOrderItems, orderItems } from "../_shared/checkoutInput.ts";
import { serviceClient, stripeClient, requireEnv } from "../_shared/clients.ts";
import { notifyOrderPaid } from "../_shared/email/notify.ts";
import { toDecimalString } from "../_shared/money.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { handleCheckout, type CheckoutDeps } from "./handler.ts";

const supabase = serviceClient();
const stripe = stripeClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));

const LABELS = { fr: "Commande", en: "Order" } as const;

const deps: CheckoutDeps = {
  origins,

  async maintenanceEnabled() {
    const { data, error } = await supabase.from("store_settings").select("maintenance_enabled").limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.maintenance_enabled === true;
  },

  async userFromToken(token) {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },

  async termsAccepted(userId) {
    const { data, error } = await supabase
      .from("consent_records")
      .select("id")
      .eq("user_id", userId)
      .eq("purpose", "terms")
      .eq("granted", true)
      .limit(1);
    if (error) throw new Error(error.message);
    return data.length > 0;
  },

  async createOrder(input, userId, reservationMinutes) {
    const { data, error } = await supabase.rpc("create_order", {
      p_user_id: userId,
      p_customer_email: input.email,
      p_items: [...orderItems(input.items, toDecimalString), ...courseOrderItems(input.course_ids)],
      p_billing_address: input.address,
      p_shipping_address: input.address,
      p_shipping_rate_id: input.shipping_rate_id,
      p_currency: "EUR",
      p_locale: input.locale,
      p_customer_note: input.customer_note,
      p_reservation_minutes: reservationMinutes,
      p_gift_card_codes: input.gift_card_codes.length > 0 ? input.gift_card_codes : null,
      p_promotion_codes: input.promotion_codes.length > 0 ? input.promotion_codes : null,
      p_use_loyalty_reward: input.use_loyalty_reward,
    });
    if (error) return { error };
    return { order: data };
  },

  async cancelOrder(orderId, reason) {
    const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason });
    if (error) throw new Error(error.message);
  },

  async releaseHeldGiftCards(codes) {
    const { data, error } = await supabase.rpc("unpaid_orders_holding_gift_cards", { p_codes: codes });
    if (error) throw new Error(error.message);
    let released = 0;
    for (const held of data ?? []) {
      // The session must be provably closed before the order is cancelled: a payment
      // being completed right now must not be cancelled under the customer.
      let closed = true;
      for (const sessionId of held.checkout_session_ids ?? []) {
        try {
          await stripe.checkout.sessions.expire(sessionId);
        } catch {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          if (session.status !== "expired") closed = false;
        }
      }
      if (!closed) continue;
      await supabase.rpc("cancel_order", { p_order_id: held.order_id, p_reason: "payment_retried" });
      released += 1;
    }
    return released;
  },

  orderPaid: (orderId) => notifyOrderPaid(orderId, (message, detail) => console.error(`[create-checkout-session] ${message}`, detail ?? "")),

  async createStripeSession(params, idempotencyKey) {
    const metadata = { order_id: params.orderId, order_number: params.orderNumber };
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: params.email,
        client_reference_id: params.orderId,
        locale: params.locale,
        // One line for the amount Postgres computed (goods, discounts, shipping,
        // gift cards already deducted): Stripe charges exactly orders.amount_due.
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: params.currency.toLowerCase(),
              unit_amount: params.amountDue,
              product_data: { name: `Global Toothgems — ${LABELS[params.locale]} ${params.orderNumber}` },
            },
          },
        ],
        metadata,
        payment_intent_data: { metadata },
        expires_at: params.expiresAt,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      },
      { idempotencyKey },
    );
    if (!session.url) throw new Error("Stripe returned a session without URL");
    return { id: session.id, url: session.url };
  },

  async recordCheckoutPayment(orderId, sessionId, amountDue, currency) {
    const { error } = await supabase.from("payments").insert({
      order_id: orderId,
      provider: "stripe",
      provider_checkout_id: sessionId,
      status: "pending",
      amount: amountDue,
      currency,
    });
    if (error) throw new Error(error.message);
  },

  now: () => Date.now(),
  log: (message, detail) => console.error(`[create-checkout-session] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleCheckout(req, deps));
