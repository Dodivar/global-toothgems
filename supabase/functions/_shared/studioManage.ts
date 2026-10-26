/**
 * Managing a 3D Studio subscription on our own page (decision 112): what the
 * browser may ask `studio-manage-subscription`, and the rules that decide
 * whether Stripe is asked at all. Pure, shared by the function and its tests.
 *
 * The rules are the ones the Stripe customer portal applied until then
 * (`studio-billing-setup` `ensurePortal`): switch plan or interval with
 * `create_prorations`, cancel at the end of the period with an optional reason,
 * replace the card, read the invoices. The browser names a plan and an interval,
 * never a price id or an amount.
 */

import { STUDIO_INTERVALS, STUDIO_LOCALES, STUDIO_PLANS, type Parsed, type StudioInterval, type StudioLocale, type StudioPlan } from "./studioBilling.ts";

/** The cancellation reasons the portal offered (Stripe's `cancellation_details.feedback`). */
export const STUDIO_CANCEL_REASONS = ["too_expensive", "missing_features", "unused", "switched_service", "other"] as const;
export type StudioCancelReason = (typeof STUDIO_CANCEL_REASONS)[number];

/** Marks the setup-mode Checkout Sessions that replace the card. */
export const STUDIO_CARD_METADATA_KIND = "studio_card";

/** A preview's proration instant may be reused by the change for this long (the amount shown is the amount charged). */
export const PRORATION_REUSE_SECONDS = 15 * 60;

export type StudioManageRequest =
  | { action: "overview"; locale: StudioLocale }
  | { action: "preview"; plan: StudioPlan; interval: StudioInterval; locale: StudioLocale }
  | { action: "change"; plan: StudioPlan; interval: StudioInterval; prorationDate: number | null; locale: StudioLocale }
  | { action: "cancel"; reason: StudioCancelReason | null; locale: StudioLocale }
  | { action: "resume"; locale: StudioLocale }
  | { action: "card_start"; locale: StudioLocale }
  | { action: "card_saved"; sessionId: string; locale: StudioLocale };

const KEYS: Record<StudioManageRequest["action"], readonly string[]> = {
  overview: [],
  preview: ["plan", "interval"],
  change: ["plan", "interval", "proration_date"],
  cancel: ["reason"],
  resume: [],
  card_start: [],
  card_saved: ["session_id"],
};

const SESSION_ID_RE = /^cs_(?:test|live)_[A-Za-z0-9]{10,250}$/;

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

/** Exactly `{ action, locale?, …that action's fields }`; anything else (a price, an amount, a user) is refused. */
export function parseStudioManageRequest(body: unknown): Parsed<StudioManageRequest> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, field: "body" };
  const record = body as Record<string, unknown>;
  const action = record.action;
  if (typeof action !== "string" || !Object.hasOwn(KEYS, action)) return { ok: false, field: "action" };
  const allowed = new Set(["action", "locale", ...KEYS[action as StudioManageRequest["action"]]]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) return { ok: false, field: key };
  }
  const locale = record.locale ?? "fr";
  if (!oneOf(STUDIO_LOCALES, locale)) return { ok: false, field: "locale" };

  switch (action) {
    case "preview":
    case "change": {
      if (!oneOf(STUDIO_PLANS, record.plan)) return { ok: false, field: "plan" };
      if (!oneOf(STUDIO_INTERVALS, record.interval)) return { ok: false, field: "interval" };
      if (action === "preview") return { ok: true, value: { action, plan: record.plan, interval: record.interval, locale } };
      const date = record.proration_date ?? null;
      if (date !== null && !(Number.isSafeInteger(date) && (date as number) > 0)) return { ok: false, field: "proration_date" };
      return { ok: true, value: { action, plan: record.plan, interval: record.interval, prorationDate: date as number | null, locale } };
    }
    case "cancel": {
      const reason = record.reason ?? null;
      if (reason !== null && !oneOf(STUDIO_CANCEL_REASONS, reason)) return { ok: false, field: "reason" };
      return { ok: true, value: { action, reason, locale } };
    }
    case "card_saved": {
      // The session must also be this member's own (checked against Stripe's metadata).
      const id = record.session_id;
      return typeof id === "string" && SESSION_ID_RE.test(id) ? { ok: true, value: { action, sessionId: id, locale } } : { ok: false, field: "session_id" };
    }
    default:
      return { ok: true, value: { action: action as "overview" | "resume" | "card_start", locale } };
  }
}

/** The member's subscription as these rules need it (read from Stripe, never from the browser). */
export interface ManagedSubscription {
  status: string;
  plan: StudioPlan | null;
  interval: StudioInterval | null;
  cancelAtPeriodEnd: boolean;
  /** A plan change waiting for its payment (`pending_if_incomplete`). */
  pendingUpdate: boolean;
}

export type ChangeRefusal = "not_active" | "cancel_scheduled" | "same_plan";

/**
 * May the plan or interval be switched? Only a subscription in good standing
 * (a payment to fix comes first), not one set to end (resume it first), and only
 * to another price. A change still waiting for its payment does not block: a new
 * one replaces it (Stripe voids the waiting invoice).
 */
export function changeRefusal(sub: ManagedSubscription, plan: StudioPlan, interval: StudioInterval): ChangeRefusal | null {
  if (sub.status !== "active" && sub.status !== "trialing") return "not_active";
  if (sub.cancelAtPeriodEnd) return "cancel_scheduled";
  if (sub.plan === plan && sub.interval === interval) return "same_plan";
  return null;
}

/** Statuses in which a subscription still runs, so it can be set to end, or kept. */
const RUNNING = new Set(["active", "trialing", "past_due", "unpaid"]);

export function cancelRefusal(sub: ManagedSubscription): "not_active" | "already_canceled" | null {
  if (!RUNNING.has(sub.status)) return "not_active";
  return sub.cancelAtPeriodEnd ? "already_canceled" : null;
}

export function resumeRefusal(sub: ManagedSubscription): "not_active" | "not_canceled" | null {
  if (!RUNNING.has(sub.status)) return "not_active";
  return sub.cancelAtPeriodEnd ? null : "not_canceled";
}

/**
 * A month ↔ year switch restarts the billing period, so Stripe invoices it at
 * once (the unused share of the old period credited); a plan switch within the
 * same interval is settled on the next invoice.
 */
export const chargedNow = (current: StudioInterval | null, target: StudioInterval) => current !== target;

/** The preview's proration instant, reused by the change when recent enough; else now. */
export function prorationInstant(requested: number | null, nowSeconds: number): number {
  if (requested === null) return nowSeconds;
  return requested <= nowSeconds && nowSeconds - requested <= PRORATION_REUSE_SECONDS ? requested : nowSeconds;
}
