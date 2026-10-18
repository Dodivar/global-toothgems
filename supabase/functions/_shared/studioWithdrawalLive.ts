/**
 * The live `WithdrawalDeps`: the database through the service role, Stripe
 * through the secret key. Used by `studio-withdraw` and `studio-billing-setup`.
 */
import type Stripe from "npm:stripe@18.5.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { refusalOf, STUDIO_WITHDRAWAL_KIND, type WithdrawalDeps, withdrawalRowOf } from "./studioWithdrawal.ts";

const RUNNING = ["active", "trialing", "past_due"];

export function liveWithdrawalDeps(
  db: SupabaseClient,
  stripe: Stripe,
  log: WithdrawalDeps["log"],
  acknowledge?: WithdrawalDeps["acknowledge"],
): WithdrawalDeps {
  return {
    async unfinishedWithdrawal(userId) {
      const { data, error } = await db
        .from("studio_withdrawals")
        .select("*, studio_subscriptions(stripe_subscription_id)")
        .eq("user_id", userId)
        .eq("status", "requested")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const sub = data.studio_subscriptions as { stripe_subscription_id: string } | null;
      return withdrawalRowOf({ ...data, stripe_subscription_id: sub?.stripe_subscription_id });
    },

    async runningSubscription(userId) {
      const { data, error } = await db
        .from("studio_subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", userId)
        .in("status", RUNNING)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.stripe_subscription_id ?? null;
    },

    async stripePeriod(stripeSubscriptionId) {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const item = sub.items.data[0];
      if (!item) throw new Error("subscription without item");
      return { start: item.current_period_start, end: item.current_period_end };
    },

    async decide(userId, periodStart, periodEnd) {
      const { data, error } = await db.rpc("request_studio_withdrawal", {
        p_user_id: userId,
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
      });
      if (error) {
        const refusal = refusalOf(error.hint);
        if (refusal) return { ok: false, refusal };
        throw new Error(`request_studio_withdrawal failed: ${error.message}`);
      }
      return { ok: true, row: withdrawalRowOf(data as Record<string, unknown>) };
    },

    async cancelSubscription(stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId, { invoice_now: false, prorate: false });
      } catch (error) {
        // A second attempt after a cancellation that went through: done already.
        const current = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        if (current.status !== "canceled") throw error;
      }
    },

    async paymentOfInvoice(stripeInvoiceId) {
      const payments = await stripe.invoicePayments.list({ invoice: stripeInvoiceId, status: "paid", limit: 10 });
      for (const entry of payments.data) {
        const pi = entry.payment.payment_intent;
        if (pi) return { paymentIntent: typeof pi === "string" ? pi : pi.id };
        const charge = entry.payment.charge;
        if (charge) return { charge: typeof charge === "string" ? charge : charge.id };
      }
      return null;
    },

    async createRefund({ payment, amountMinor, withdrawalId, userId }) {
      const refund = await stripe.refunds.create(
        {
          ...("paymentIntent" in payment ? { payment_intent: payment.paymentIntent } : { charge: payment.charge }),
          amount: amountMinor,
          reason: "requested_by_customer",
          metadata: { kind: STUDIO_WITHDRAWAL_KIND, withdrawal_id: withdrawalId, user_id: userId },
        },
        { idempotencyKey: `studio-withdrawal:${withdrawalId}` },
      );
      return { id: refund.id };
    },

    async recordStep(withdrawalId, step, refundId) {
      const { error } = await db.rpc("record_studio_withdrawal_step", {
        p_withdrawal_id: withdrawalId,
        p_step: step,
        p_stripe_refund_id: refundId ?? null,
      });
      if (error) throw new Error(`record_studio_withdrawal_step failed: ${error.message}`);
    },

    acknowledge,
    log,
  };
}
