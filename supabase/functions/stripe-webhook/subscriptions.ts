import { toDecimalString } from "../_shared/money.ts";
import { STUDIO_METADATA_KIND, STUDIO_SUBSCRIPTION_EVENTS } from "../_shared/studioBilling.ts";

/**
 * The 3D Studio subscription branch of `stripe-webhook` (decision 94).
 *
 *   customer.subscription.created / .updated / .deleted   (a Subscription)
 *   invoice.paid / invoice.payment_failed                 (an Invoice of a subscription)
 *   checkout.session.completed in subscription mode       (a Checkout Session)
 *
 * Every one of them names a subscription. The subscription is then READ BACK
 * from Stripe and mirrored as it is now (`apply_studio_subscription()`), so the
 * order in which Stripe delivers events, and replays, change nothing. Only
 * subscriptions this site created (metadata kind = studio_subscription) are
 * mirrored; others on the same Stripe account are ignored.
 *
 * An invoice is then recorded with its billing reason (`record_studio_invoice()`):
 * `subscription_create` is a new subscription, `subscription_cycle` a renewal.
 */

export const HANDLED_SUBSCRIPTION_EVENTS = STUDIO_SUBSCRIPTION_EVENTS;

/** A subscription as the webhook needs it (Stripe API 2025-08-27.basil: the period is on the item). */
export interface StudioSubscriptionState {
  id: string;
  customerId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  livemode: boolean;
  metadata: Record<string, string>;
}

export interface StudioInvoice {
  id: string;
  subscriptionId: string;
  billingReason: string | null;
  status: "paid" | "payment_failed";
  amountMinor: number;
  currency: string;
  occurredAt: number;
}

export interface SubscriptionDeps {
  retrieveSubscription(subscriptionId: string): Promise<StudioSubscriptionState>;
  applySubscription(args: {
    subscriptionId: string;
    customerId: string;
    metadataUserId: string | null;
    priceId: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    canceledAt: string | null;
    livemode: boolean;
  }): Promise<{ created: boolean; otherLiveSubscriptions: number }>;
  recordStudioInvoice(args: {
    invoiceId: string;
    subscriptionId: string;
    billingReason: string | null;
    status: "paid" | "payment_failed";
    amount: string;
    currency: string;
    occurredAt: string;
  }): Promise<void>;
  log(message: string, detail?: unknown): void;
}

/** What a subscription event names: the subscription, and the invoice when it is one. */
export interface SubscriptionEventTarget {
  subscriptionId: string;
  objectId: string;
  invoice: StudioInvoice | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (value: unknown): string | null =>
  typeof value === "string" ? value : value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string"
    ? (value as { id: string }).id
    : null;

/** The subscription an event is about, or null when it is not a subscription event of ours to look at. */
export function subscriptionTarget(type: string, object: unknown): SubscriptionEventTarget | null {
  if (!object || typeof object !== "object") return null;
  const o = object as Record<string, unknown>;

  if (type.startsWith("customer.subscription.") && o.object === "subscription" && typeof o.id === "string") {
    return { subscriptionId: o.id, objectId: o.id, invoice: null };
  }

  if ((type === "invoice.paid" || type === "invoice.payment_failed") && o.object === "invoice" && typeof o.id === "string") {
    // basil: the subscription is under parent.subscription_details.
    const parent = o.parent as { subscription_details?: { subscription?: unknown } | null } | null | undefined;
    const subscriptionId = idOf(parent?.subscription_details?.subscription);
    if (!subscriptionId) return null;
    const paid = type === "invoice.paid";
    const transitions = o.status_transitions as { paid_at?: number | null } | undefined;
    const amount = paid ? o.amount_paid : o.amount_due;
    return {
      subscriptionId,
      objectId: o.id,
      invoice: {
        id: o.id,
        subscriptionId,
        billingReason: typeof o.billing_reason === "string" ? o.billing_reason : null,
        status: paid ? "paid" : "payment_failed",
        amountMinor: typeof amount === "number" ? amount : 0,
        currency: typeof o.currency === "string" ? o.currency.toUpperCase() : "EUR",
        occurredAt: (paid && typeof transitions?.paid_at === "number" ? transitions.paid_at : null) ??
          (typeof o.created === "number" ? o.created : Math.floor(Date.now() / 1000)),
      },
    };
  }

  if (type === "checkout.session.completed" && o.object === "checkout.session" && o.mode === "subscription" && typeof o.id === "string") {
    const subscriptionId = idOf(o.subscription);
    return subscriptionId ? { subscriptionId, objectId: o.id, invoice: null } : null;
  }
  return null;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Mirrors the subscription (and records the invoice). "ignored" when it is not a Studio subscription. */
export async function applySubscriptionEvent(target: SubscriptionEventTarget, deps: SubscriptionDeps): Promise<"processed" | "ignored"> {
  const sub = await deps.retrieveSubscription(target.subscriptionId);
  if (sub.metadata?.kind !== STUDIO_METADATA_KIND) return "ignored";
  if (!sub.priceId || sub.currentPeriodEnd === null) {
    throw new SubscriptionShapeError("subscription without price or period");
  }
  const userId = sub.metadata.user_id;
  const result = await deps.applySubscription({
    subscriptionId: sub.id,
    customerId: sub.customerId,
    metadataUserId: typeof userId === "string" && UUID_RE.test(userId) ? userId.toLowerCase() : null,
    priceId: sub.priceId,
    status: sub.status,
    currentPeriodEnd: iso(sub.currentPeriodEnd),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    canceledAt: sub.canceledAt === null ? null : iso(sub.canceledAt),
    livemode: sub.livemode,
  });
  if (result.otherLiveSubscriptions > 0) {
    // Two paid subscriptions on one account (two checkouts at once): left for the team, never auto-cancelled.
    deps.log("account holds more than one live Studio subscription", { subscription: sub.id });
  }

  if (target.invoice) {
    await deps.recordStudioInvoice({
      invoiceId: target.invoice.id,
      subscriptionId: sub.id,
      billingReason: target.invoice.billingReason,
      status: target.invoice.status,
      amount: toDecimalString(target.invoice.amountMinor),
      currency: target.invoice.currency,
      occurredAt: iso(target.invoice.occurredAt),
    });
  }
  return "processed";
}

/** A subscription Stripe returned in a shape we cannot mirror: permanent, like an invalid argument. */
export class SubscriptionShapeError extends Error {
  readonly code = "22023";
}
