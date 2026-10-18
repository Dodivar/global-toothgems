import { requireEnv, serviceClient, stripeClient, stripeCryptoProvider } from "../_shared/clients.ts";
import { notifyOrderPaid, notifyRefundConfirmed } from "../_shared/email/notify.ts";
import { DbCallError, handleWebhook, type WebhookDeps, type WebhookEvent } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): Stripe does not
 * send a Supabase token. The Stripe signature is the authentication.
 */

const supabase = serviceClient();
const stripe = stripeClient();
const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");

function dbError(error: { message: string; code?: string }): DbCallError {
  return new DbCallError(error.message, error.code);
}

const deps: WebhookDeps = {
  async verify(rawBody, signature) {
    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      stripeCryptoProvider,
    );
    return event as unknown as WebhookEvent;
  },

  async recordEvent(event, objectId, orderId) {
    const { data, error } = await supabase.rpc("record_stripe_webhook_event", {
      p_event_id: event.id,
      p_type: event.type,
      p_livemode: event.livemode,
      p_object_id: objectId,
      p_order_id: orderId,
    });
    if (error) throw dbError(error);
    return data;
  },

  async finishEvent(eventId, status, message) {
    const { error } = await supabase
      .from("stripe_webhook_events")
      .update({ status, error: message ?? null, processed_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) throw dbError(error);
  },

  async orderState(orderId) {
    const { data, error } = await supabase
      .from("orders")
      .select("status, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw dbError(error);
    return data ? { status: data.status, paymentStatus: data.payment_status } : null;
  },

  async paymentDetails(paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    const details = charge?.payment_method_details;
    const card = details?.card;
    return {
      methodType: details?.type?.slice(0, 40) ?? null,
      cardBrand: card?.brand?.slice(0, 20) ?? null,
      cardLast4: card?.last4 && /^[0-9]{4}$/.test(card.last4) ? card.last4 : null,
    };
  },

  async markOrderPaid({ orderId, amount, currency, checkoutId, paymentId, details }) {
    const { error } = await supabase.rpc("mark_order_paid", {
      p_order_id: orderId,
      p_amount: amount,
      p_currency: currency,
      p_provider_checkout_id: checkoutId,
      p_provider_payment_id: paymentId,
      p_payment_method_type: details.methodType,
      p_card_brand: details.cardBrand,
      p_card_last4: details.cardLast4,
    });
    if (error) throw dbError(error);
  },

  async cancelOrder(orderId, reason) {
    const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason });
    if (error) throw dbError(error);
  },

  orderPaid: (orderId) => notifyOrderPaid(orderId, (message, detail) => console.error(`[stripe-webhook] ${message}`, detail ?? "")),

  async closeCheckoutPayment(checkoutId, status, reason) {
    const { error } = await supabase
      .from("payments")
      .update({ status, failure_reason: reason })
      .eq("provider_checkout_id", checkoutId)
      .eq("status", "pending");
    if (error) throw dbError(error);
  },

  async findRefund(refundId, providerRefundId) {
    if (refundId) {
      const { data, error } = await supabase.from("refunds").select("id, status").eq("id", refundId).maybeSingle();
      if (error) throw dbError(error);
      if (data) return data;
    }
    const { data, error } = await supabase
      .from("refunds")
      .select("id, status")
      .eq("provider_refund_id", providerRefundId)
      .maybeSingle();
    if (error) throw dbError(error);
    return data;
  },

  async markRefundSucceeded(refundId, providerRefundId) {
    const { error } = await supabase.rpc("mark_refund_succeeded", {
      p_refund_id: refundId,
      p_provider_refund_id: providerRefundId,
    });
    if (error) throw dbError(error);
  },

  async markRefundFailed(refundId, reason) {
    const { error } = await supabase.rpc("mark_refund_failed", { p_refund_id: refundId, p_reason: reason });
    if (error) throw dbError(error);
  },

  async settleStudioWithdrawal({ withdrawalId, providerRefundId, status, reason }) {
    const { error } = await supabase.rpc("settle_studio_withdrawal_refund", {
      p_withdrawal_id: withdrawalId,
      p_stripe_refund_id: providerRefundId,
      p_status: status,
      p_reason: reason,
    });
    if (error) throw dbError(error);
  },

  async recordExternalRefund({ paymentIntentId, providerRefundId, amount, currency }) {
    const { error } = await supabase.rpc("record_external_refund", {
      p_provider_payment_id: paymentIntentId,
      p_provider_refund_id: providerRefundId,
      p_amount: amount,
      p_currency: currency,
    });
    if (error) throw dbError(error);
  },

  studio: {
    async retrieveSubscription(subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const item = sub.items.data[0];
      return {
        id: sub.id,
        customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        status: sub.status,
        priceId: item?.price?.id ?? null,
        // API 2025-08-27.basil: the billing period lives on the subscription item.
        currentPeriodEnd: item?.current_period_end ?? null,
        // A cancellation scheduled from the portal sets either flag depending on its settings.
        cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
        canceledAt: sub.canceled_at ?? null,
        livemode: sub.livemode,
        metadata: sub.metadata ?? {},
      };
    },

    async applySubscription(args) {
      const { data, error } = await supabase.rpc("apply_studio_subscription", {
        p_stripe_subscription_id: args.subscriptionId,
        p_stripe_customer_id: args.customerId,
        p_metadata_user_id: args.metadataUserId,
        p_stripe_price_id: args.priceId,
        p_status: args.status,
        p_current_period_end: args.currentPeriodEnd,
        p_cancel_at_period_end: args.cancelAtPeriodEnd,
        p_canceled_at: args.canceledAt,
        p_livemode: args.livemode,
      });
      if (error) throw dbError(error);
      const row = (data ?? {}) as { created?: boolean; other_live_subscriptions?: number };
      return { created: row.created === true, otherLiveSubscriptions: Number(row.other_live_subscriptions ?? 0) };
    },

    async recordStudioInvoice(args) {
      const { error } = await supabase.rpc("record_studio_invoice", {
        p_stripe_invoice_id: args.invoiceId,
        p_stripe_subscription_id: args.subscriptionId,
        p_billing_reason: args.billingReason,
        p_status: args.status,
        p_amount: args.amount,
        p_currency: args.currency,
        p_occurred_at: args.occurredAt,
      });
      if (error) throw dbError(error);
    },
  },

  refundConfirmed: () => notifyRefundConfirmed((message, detail) => console.error(`[stripe-webhook] ${message}`, detail ?? "")),

  log: (message, detail) => console.error(`[stripe-webhook] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleWebhook(req, deps));
