/**
 * 3D Studio subscriptions (decision 94): what the browser may ask for and the
 * addresses it comes back to. Pure, shared by `create-studio-subscription`,
 * `studio-billing-portal` and their tests.
 *
 * The browser names a plan and a billing interval — never a Stripe price id or
 * an amount: the price is looked up in `studio_plan_prices`.
 */

export const STUDIO_PLANS = ["essential", "artist", "atelier"] as const;
export const STUDIO_INTERVALS = ["month", "year"] as const;
export const STUDIO_LOCALES = ["fr", "en"] as const;

export type StudioPlan = (typeof STUDIO_PLANS)[number];
export type StudioInterval = (typeof STUDIO_INTERVALS)[number];
export type StudioLocale = (typeof STUDIO_LOCALES)[number];

export interface StudioSubscriptionInput {
  plan: StudioPlan;
  interval: StudioInterval;
  locale: StudioLocale;
}

/** The Stripe events `stripe-webhook` mirrors subscriptions from (the endpoint must receive them). */
export const STUDIO_SUBSCRIPTION_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

/** Marks the Stripe objects this site creates for the Studio (subscription and Checkout metadata). */
export const STUDIO_METADATA_KIND = "studio_subscription";

/** Where the editor lives (zone page, not language-prefixed) and the member's subscription page. */
export const STUDIO_EDITOR_PATH = "/studio-3d/atelier";
export const ACCOUNT_STUDIO_PATH = "/compte/studio";

export const studioSuccessUrl = (origin: string) => `${origin}${STUDIO_EDITOR_PATH}?subscription=success`;
export const studioCancelUrl = (origin: string) => `${origin}${STUDIO_EDITOR_PATH}?subscription=canceled`;
export const accountStudioUrl = (origin: string) => `${origin}${ACCOUNT_STUDIO_PATH}`;

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

/** Exactly `{ plan, interval, locale? }`: anything else is refused. */
export function parseStudioSubscriptionInput(body: unknown): Parsed<StudioSubscriptionInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, field: "body" };
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "plan" && key !== "interval" && key !== "locale") return { ok: false, field: key };
  }
  if (!oneOf(STUDIO_PLANS, record.plan)) return { ok: false, field: "plan" };
  if (!oneOf(STUDIO_INTERVALS, record.interval)) return { ok: false, field: "interval" };
  const locale = record.locale ?? "fr";
  if (!oneOf(STUDIO_LOCALES, locale)) return { ok: false, field: "locale" };
  return { ok: true, value: { plan: record.plan, interval: record.interval, locale } };
}

/**
 * Subscription statuses that stand in the way of a new checkout: a live
 * subscription, one being set up, or one whose payment needs fixing (the
 * customer portal is the place for that). `canceled` and `incomplete_expired`
 * leave the way open.
 */
export const BLOCKING_STATUSES = ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"] as const;

export function bearer(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

/** A user access token is a JWT; the publishable key (`sb_publishable_…`) is not. */
export const looksLikeJwt = (token: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
