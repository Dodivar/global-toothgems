/**
 * Withdrawing from a 3D Studio subscription within 14 days (decision 95).
 * Shared by `studio-withdraw` (the member) and `studio-billing-setup`'s
 * `smoke_withdraw` (test mode, no browser); pure orchestration over `deps`.
 *
 *   1. a withdrawal decided earlier whose Stripe steps did not all run is
 *      resumed; otherwise the running subscription's period is read from Stripe
 *      and `request_studio_withdrawal()` decides — the database alone says
 *      whether the member may withdraw and how much comes back (never the
 *      browser, never this code);
 *   2. the subscription is cancelled at Stripe at once, without proration
 *      (access ends when the verified webhook mirrors `customer.subscription.deleted`);
 *   3. the rest of the first payment is refunded to the payment that paid the
 *      first invoice (idempotency key `studio-withdrawal:<id>`, metadata
 *      kind = studio_withdrawal); nothing is refunded when nothing is left;
 *   4. each step is recorded on the row, so a second call picks up where a
 *      failed one stopped. The refund is confirmed only by the verified
 *      `refund.*` webhook (`settle_studio_withdrawal_refund()`).
 */
import { toMinorUnits } from "./money.ts";

export const STUDIO_WITHDRAWAL_KIND = "studio_withdrawal";

/** Why the database refused (its exception hint). */
export const WITHDRAWAL_REFUSALS = [
  "no_subscription",
  "not_paid",
  "renewal",
  "manual_review",
  "deadline_passed",
  "withdrawn",
] as const;
export type WithdrawalRefusal = (typeof WITHDRAWAL_REFUSALS)[number];

export interface WithdrawalRow {
  id: string;
  status: "requested" | "refund_pending" | "refunded" | "refund_failed" | "no_refund";
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  canceledAt: string | null;
  stripeRefundId: string | null;
  usedDays: number;
  periodDays: number;
  paidAmount: number | string;
  usedAmount: number | string;
  refundAmount: number | string;
  currency: string;
}

export type Decision = { ok: true; row: WithdrawalRow } | { ok: false; refusal: WithdrawalRefusal };

export interface WithdrawalDeps {
  /** The member's withdrawal whose Stripe steps are not all done (status `requested`), or null. */
  unfinishedWithdrawal(userId: string): Promise<WithdrawalRow | null>;
  /** The Stripe id of the member's running subscription (active, trialing, past_due), or null. */
  runningSubscription(userId: string): Promise<string | null>;
  /** The subscription's current period at Stripe (seconds since the epoch). */
  stripePeriod(stripeSubscriptionId: string): Promise<{ start: number; end: number }>;
  /** `request_studio_withdrawal()`; a refusal comes back as its reason. */
  decide(userId: string, periodStart: Date, periodEnd: Date): Promise<Decision>;
  /** Cancels now, no proration; a subscription already cancelled counts as done. */
  cancelSubscription(stripeSubscriptionId: string): Promise<void>;
  /** The payment that paid the invoice: a PaymentIntent, else a charge; null when neither. */
  paymentOfInvoice(stripeInvoiceId: string): Promise<{ paymentIntent: string } | { charge: string } | null>;
  createRefund(args: {
    payment: { paymentIntent: string } | { charge: string };
    amountMinor: number;
    withdrawalId: string;
    userId: string;
  }): Promise<{ id: string }>;
  recordStep(withdrawalId: string, step: "canceled" | "refund_sent" | "no_refund", refundId?: string): Promise<void>;
  /** Sends the acknowledgement e-mail now (the sweep catches it otherwise); never throws. */
  acknowledge?(): Promise<void>;
  log(message: string, detail?: unknown): void;
}

export interface WithdrawalSummary {
  withdrawalId: string;
  status: WithdrawalRow["status"];
  usedDays: number;
  periodDays: number;
  /** Minor units. */
  usedAmount: number;
  refundAmount: number;
  currency: string;
}

export type WithdrawalOutcome =
  | { kind: "done"; summary: WithdrawalSummary }
  | { kind: "refused"; refusal: WithdrawalRefusal }
  /** Decided, but a Stripe step failed: calling again resumes it. */
  | { kind: "incomplete"; step: "cancel" | "refund" };

const summaryOf = (row: WithdrawalRow, status: WithdrawalRow["status"]): WithdrawalSummary => ({
  withdrawalId: row.id,
  status,
  usedDays: row.usedDays,
  periodDays: row.periodDays,
  usedAmount: toMinorUnits(row.usedAmount),
  refundAmount: toMinorUnits(row.refundAmount),
  currency: row.currency,
});

export async function withdrawFromStudio(userId: string, deps: WithdrawalDeps): Promise<WithdrawalOutcome> {
  let row = await deps.unfinishedWithdrawal(userId);
  if (!row) {
    const subscription = await deps.runningSubscription(userId);
    // Nothing running (never subscribed, or already withdrawn and cancelled).
    if (!subscription) return { kind: "refused", refusal: "no_subscription" };
    const period = await deps.stripePeriod(subscription);
    const decision = await deps.decide(userId, new Date(period.start * 1000), new Date(period.end * 1000));
    if (!decision.ok) return { kind: "refused", refusal: decision.refusal };
    row = decision.row;
  }

  let status = row.status;
  if (status === "requested") {
    if (!row.canceledAt) {
      try {
        await deps.cancelSubscription(row.stripeSubscriptionId);
        await deps.recordStep(row.id, "canceled");
      } catch (error) {
        deps.log("subscription not cancelled", { id: row.id, error: error instanceof Error ? error.message : error });
        return { kind: "incomplete", step: "cancel" };
      }
    }

    const amountMinor = toMinorUnits(row.refundAmount);
    try {
      if (amountMinor === 0) {
        await deps.recordStep(row.id, "no_refund");
        status = "no_refund";
      } else if (!row.stripeRefundId) {
        const payment = await deps.paymentOfInvoice(row.stripeInvoiceId);
        if (!payment) throw new Error("no payment to refund on the first invoice");
        const refund = await deps.createRefund({ payment, amountMinor, withdrawalId: row.id, userId });
        await deps.recordStep(row.id, "refund_sent", refund.id);
        status = "refund_pending";
      }
    } catch (error) {
      deps.log("refund not sent", { id: row.id, error: error instanceof Error ? error.message : error });
      return { kind: "incomplete", step: "refund" };
    }
  }

  try {
    await deps.acknowledge?.();
  } catch (error) {
    deps.log("acknowledgement not sent now", error instanceof Error ? error.message : error);
  }
  return { kind: "done", summary: summaryOf(row, status) };
}

/** A `request_studio_withdrawal()` row (jsonb, snake_case) → the shape above. */
export function withdrawalRowOf(value: Record<string, unknown>): WithdrawalRow {
  return {
    id: String(value.id),
    status: value.status as WithdrawalRow["status"],
    stripeSubscriptionId: String(value.stripe_subscription_id),
    stripeInvoiceId: String(value.stripe_invoice_id),
    canceledAt: (value.canceled_at as string | null) ?? null,
    stripeRefundId: (value.stripe_refund_id as string | null) ?? null,
    usedDays: Number(value.used_days),
    periodDays: Number(value.period_days),
    paidAmount: value.paid_amount as number | string,
    usedAmount: value.used_amount as number | string,
    refundAmount: value.refund_amount as number | string,
    currency: String(value.currency),
  };
}

/** The reason in a refusal's hint, when it is one of ours. */
export function refusalOf(hint: string | null | undefined): WithdrawalRefusal | null {
  return (WITHDRAWAL_REFUSALS as readonly string[]).includes(hint ?? "") ? (hint as WithdrawalRefusal) : null;
}
