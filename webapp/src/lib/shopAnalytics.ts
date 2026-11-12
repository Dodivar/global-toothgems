import { captureEvent, captureOnce, type AnalyticsProps } from "./analyticsCore";

/**
 * The shop's checkout funnel, sent to PostHog (`instrumentation-client.ts`):
 * product → cart → checkout → payment step → paid, with the failures in
 * between. The event list and how to read it: `docs/shop-analytics.md`.
 *
 * - Only with the visitor's analytics consent: PostHog stays opted out
 *   otherwise (`lib/posthogSession.tsx`) and nothing is sent or stored here.
 * - Never in the way: a missing or failing PostHog is swallowed.
 * - Nothing personal or secret: no name, e-mail or address, never a gift card
 *   code (a bearer credential) — only counts, amounts, states and Stripe's
 *   error codes. Promotion codes are marketing words, sent as typed (upper case).
 * - Amounts are what the browser shows (indicative, minor units); the money
 *   of record is the database's (`/admin/statistiques`) and Stripe's.
 */

export type ShopEvent =
  | "product_added_to_cart"
  | "checkout_started"
  /** The checkout could not open a payment step: the reason the cart shows (`CheckoutError`). */
  | "checkout_failed"
  | "payment_step_opened"
  | "payment_submitted"
  /** The payment did not go through: declined at confirmation, form that did not load, step expired, or an unpaid return. */
  | "payment_failed"
  /** The order is paid, on the database's word (verified webhook, or entirely covered by gift cards). */
  | "order_completed"
  /** The confirmation page gave up waiting for the webhook. */
  | "payment_confirmation_slow"
  | "promo_code_applied"
  | "promo_code_rejected"
  | "gift_card_code_applied"
  | "gift_card_code_rejected"
  | "review_submitted";

/** Sends one event, if allowed (consent, `analyticsCore.ts`). Never throws. */
export function trackShop(event: ShopEvent, props: AnalyticsProps = {}) {
  captureEvent(event, props);
}

/**
 * `trackShop` at most once per `key` in this tab (a reload of the
 * confirmation page must not count the order twice). Session storage
 * `gt-shop-evt:<key>`, written only with consent, listed in the cookie policy.
 */
export function trackShopOnce(key: string, event: ShopEvent, props: AnalyticsProps = {}) {
  captureOnce(`gt-shop-evt:${key}`, event, props);
}

/** Why a payment did not go through, as `StripePaymentForm` reports it. */
export interface PaymentFailure {
  /** `confirm`: Stripe refused the payment; `load`: the form did not load; `expired`: the step timed out. */
  stage: "confirm" | "load" | "expired";
  /** Stripe's code (`paymentFailed`…), null when it gave none. */
  code: string | null;
  /** The card issuer's reason (`insufficient_funds`, `card_declined`…), when Stripe gives one. */
  declineCode: string | null;
}

/** The new promotion codes a successful quote accepted (upper case), and the codes it now covers. */
export function newlyAccepted(previous: readonly string[], current: readonly string[]): string[] {
  return current.filter((code) => !previous.includes(code)).map((code) => code.toUpperCase());
}
