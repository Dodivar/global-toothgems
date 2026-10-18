import { corsHeaders, json, readJson, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import {
  bearer,
  looksLikeJwt,
  parseStudioSubscriptionInput,
  studioCancelUrl,
  studioSuccessUrl,
  type StudioInterval,
  type StudioLocale,
  type StudioPlan,
} from "../_shared/studioBilling.ts";

/**
 * POST /functions/v1/create-studio-subscription   { plan, interval, locale }
 *
 *   1. signed-in members only (their Supabase access token); the plan and the
 *      interval are validated strictly — no price id or amount is accepted
 *   2. one subscription per account: a live one (or one whose payment needs
 *      fixing) is answered `already_subscribed` (the customer portal manages it)
 *   3. the Stripe Price comes from `studio_plan_prices`; the account's Stripe
 *      customer is reused, or created once
 *   4. the customer's other open subscription Checkouts are expired, so two
 *      tabs cannot both end in a paid subscription
 *   5. a Stripe Checkout Session in subscription mode (Stripe's hosted page);
 *      the browser is sent to its `url`
 *
 * Nothing is granted here: access opens only when the verified `stripe-webhook`
 * mirrors the subscription into `studio_subscriptions` (decision 94).
 */

export interface PlanPrice {
  stripePriceId: string;
  /** VAT included, in integer minor units. */
  amountMinor: number;
  currency: string;
}

export interface StudioSessionParams {
  customerId: string;
  priceId: string;
  userId: string;
  plan: StudioPlan;
  interval: StudioInterval;
  locale: StudioLocale;
  successUrl: string;
  cancelUrl: string;
}

export interface StudioCheckoutDeps {
  origins: SiteOrigins;
  /** The signed-in member behind a token, or null. */
  userFromToken(token: string): Promise<{ id: string; email: string | null } | null>;
  termsAccepted(userId: string): Promise<boolean>;
  /** True when the account holds a subscription in a blocking status (`BLOCKING_STATUSES`). */
  hasBlockingSubscription(userId: string): Promise<boolean>;
  planPrice(plan: StudioPlan, interval: StudioInterval): Promise<PlanPrice | null>;
  /** The account's Stripe customer id, created (and stored) on first use. */
  ensureCustomer(userId: string, email: string | null): Promise<string>;
  /** Expires the customer's open subscription Checkouts; returns how many. */
  expireOpenSessions(customerId: string): Promise<number>;
  createSession(params: StudioSessionParams): Promise<{ id: string; url: string }>;
  log(message: string, detail?: unknown): void;
}

export type StudioCheckoutError =
  | "invalid_request"
  | "sign_in_required"
  | "session_expired"
  | "terms_required"
  | "already_subscribed"
  | "plan_unavailable"
  | "payment_unavailable"
  | "server_error";

const STATUS: Record<StudioCheckoutError, number> = {
  invalid_request: 400,
  sign_in_required: 401,
  session_expired: 401,
  terms_required: 403,
  already_subscribed: 409,
  plan_unavailable: 409,
  payment_unavailable: 502,
  server_error: 500,
};

const MAX_BODY_BYTES = 2 * 1024;

export async function handleStudioCheckout(req: Request, deps: StudioCheckoutDeps): Promise<Response> {
  const requestOrigin = req.headers.get("origin");
  const cors = corsHeaders(deps.origins, requestOrigin);
  const fail = (code: StudioCheckoutError, extra: Record<string, unknown> = {}) =>
    json({ error: code, ...extra }, STATUS[code], cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return fail("sign_in_required");

  const parsed = parseStudioSubscriptionInput(await readJson(req, MAX_BODY_BYTES));
  if (!parsed.ok) return fail("invalid_request", { field: parsed.field });
  const input = parsed.value;

  let user: { id: string; email: string | null } | null;
  try {
    user = await deps.userFromToken(token);
  } catch (error) {
    deps.log("token check failed", error instanceof Error ? error.message : error);
    return fail("server_error");
  }
  if (!user) return fail("session_expired");

  let price: PlanPrice | null;
  try {
    // An account created through Google may not have accepted the terms yet.
    if (!(await deps.termsAccepted(user.id))) return fail("terms_required");
    if (await deps.hasBlockingSubscription(user.id)) return fail("already_subscribed");
    price = await deps.planPrice(input.plan, input.interval);
  } catch (error) {
    deps.log("account checks failed", error instanceof Error ? error.message : error);
    return fail("server_error");
  }
  if (!price) return fail("plan_unavailable");

  const origin = returnOrigin(deps.origins, requestOrigin);
  try {
    const customerId = await deps.ensureCustomer(user.id, user.email);
    try {
      await deps.expireOpenSessions(customerId);
    } catch (error) {
      // Not blocking: a second paid subscription is detected by the webhook.
      deps.log("open sessions not expired", error instanceof Error ? error.message : error);
    }
    const session = await deps.createSession({
      customerId,
      priceId: price.stripePriceId,
      userId: user.id,
      plan: input.plan,
      interval: input.interval,
      locale: input.locale,
      successUrl: studioSuccessUrl(origin),
      cancelUrl: studioCancelUrl(origin),
    });
    return json(
      { status: "checkout", url: session.url, amount: price.amountMinor, currency: price.currency },
      200,
      cors,
    );
  } catch (error) {
    deps.log("Stripe checkout not created", error instanceof Error ? error.message : error);
    return fail("payment_unavailable");
  }
}
