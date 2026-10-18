import { corsHeaders, json, readJson, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import {
  bearer,
  looksLikeJwt,
  parseStudioCheckoutRequest,
  STUDIO_METADATA_KIND,
  studioReturnUrl,
  type StudioInterval,
  type StudioLocale,
  type StudioPlan,
  type StudioSubscriptionInput,
} from "../_shared/studioBilling.ts";

/**
 * POST /functions/v1/create-studio-subscription
 *
 * The 3D Studio subscription is paid on our own page (decision 94, payment step
 * since 2026-10-18): Stripe's Payment Element is mounted from a Checkout Session
 * in `custom` ui mode and subscription mode, like the shop's checkout. Three
 * requests, all from a signed-in member (their Supabase access token):
 *
 *   { plan, interval, locale }      open a payment step
 *     1. the plan and the interval are validated strictly — no price id or
 *        amount is accepted; terms accepted; one subscription per account (a
 *        live one, or one whose payment needs fixing, is `already_subscribed`)
 *     2. the Stripe Price comes from `studio_plan_prices`; the account's Stripe
 *        customer is reused, or created once; its other open Studio sessions are
 *        expired, so two tabs cannot both end in a paid subscription
 *     3. answer { status: "payment", client_secret, publishable_key, amount,
 *        currency, expires_at }
 *
 *   { consent_client_secret }       the member ticked the immediate-access request
 *     (L221-25, decision 94 (a)) in the payment step and pressed Pay: the
 *     session must be open, the Studio's and this member's; the request is
 *     recorded in `consent_records` (`STUDIO_WITHDRAWAL_CONSENT.version`) and
 *     its id written into the session's metadata. The browser confirms the
 *     payment only after this answer { status: "consented" }.
 *
 *   { release_client_secret }       the member left the payment step: the open
 *     session is expired. Always { status: "released" } once signed in.
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
  returnUrl: string;
  /** Unix seconds: when the session stops accepting a payment. */
  expiresAt: number;
}

/** The session behind a client secret, as Stripe reports it. */
export interface StudioSessionState {
  clientSecret: string | null;
  status: string | null;
  kind: string | null;
  userId: string | null;
}

export interface StudioCheckoutDeps {
  origins: SiteOrigins;
  /** Stripe publishable key of the secret key's mode, or null when not configured (nothing opens). */
  publishableKey: string | null;
  /** The signed-in member behind a token, or null. */
  userFromToken(token: string): Promise<{ id: string; email: string | null } | null>;
  termsAccepted(userId: string): Promise<boolean>;
  /** True when the account holds a subscription in a blocking status (`BLOCKING_STATUSES`). */
  hasBlockingSubscription(userId: string): Promise<boolean>;
  planPrice(plan: StudioPlan, interval: StudioInterval): Promise<PlanPrice | null>;
  /** Records the immediate-access request (`STUDIO_WITHDRAWAL_CONSENT.version`); returns the row's id. */
  recordWithdrawalConsent(userId: string): Promise<string>;
  /** The account's Stripe customer id, created (and stored) on first use. */
  ensureCustomer(userId: string, email: string | null): Promise<string>;
  /** Expires the customer's open subscription Checkouts; returns how many. */
  expireOpenSessions(customerId: string): Promise<number>;
  createSession(params: StudioSessionParams): Promise<{ id: string; clientSecret: string }>;
  /** The session, or null when Stripe does not know it. */
  retrieveSession(sessionId: string): Promise<StudioSessionState | null>;
  /** Writes the recorded request's id into the session's metadata. */
  markSessionConsent(sessionId: string, consentId: string): Promise<void>;
  expireSession(sessionId: string): Promise<void>;
  now(): number;
  log(message: string, detail?: unknown): void;
}

export type StudioCheckoutError =
  | "invalid_request"
  | "sign_in_required"
  | "session_expired"
  | "terms_required"
  | "already_subscribed"
  | "plan_unavailable"
  | "checkout_closed"
  | "payment_unavailable"
  | "server_error";

const STATUS: Record<StudioCheckoutError, number> = {
  invalid_request: 400,
  sign_in_required: 401,
  session_expired: 401,
  terms_required: 403,
  already_subscribed: 409,
  plan_unavailable: 409,
  checkout_closed: 409,
  payment_unavailable: 502,
  server_error: 500,
};

const MAX_BODY_BYTES = 2 * 1024;
/** How long a payment step stays payable (Stripe's minimum is 30 minutes). */
const SESSION_MINUTES = 60;

type Fail = (code: StudioCheckoutError, extra?: Record<string, unknown>) => Response;
type Member = { id: string; email: string | null };

export async function handleStudioCheckout(req: Request, deps: StudioCheckoutDeps): Promise<Response> {
  const requestOrigin = req.headers.get("origin");
  const cors = corsHeaders(deps.origins, requestOrigin);
  const fail: Fail = (code, extra = {}) => json({ error: code, ...extra }, STATUS[code], cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return fail("sign_in_required");

  const parsed = parseStudioCheckoutRequest(await readJson(req, MAX_BODY_BYTES));
  if (!parsed.ok) return fail("invalid_request", { field: parsed.field });
  const request = parsed.value;

  let user: Member | null;
  try {
    user = await deps.userFromToken(token);
  } catch (error) {
    deps.log("token check failed", error instanceof Error ? error.message : error);
    return fail("server_error");
  }
  if (!user) return fail("session_expired");

  if (request.action === "open") return await openPaymentStep(request.input, user, returnOrigin(deps.origins, requestOrigin), deps, fail, cors);

  // A step named by its client secret: it must be this member's Studio session.
  let session: StudioSessionState | null;
  try {
    session = await deps.retrieveSession(request.sessionId);
  } catch (error) {
    deps.log("session not read", error instanceof Error ? error.message : error);
    return request.action === "release" ? json({ status: "released" }, 200, cors) : fail("payment_unavailable");
  }
  const owned =
    session !== null &&
    session.clientSecret === request.secret &&
    session.kind === STUDIO_METADATA_KIND &&
    session.userId === user.id;

  if (request.action === "release") {
    if (owned && session!.status === "open") {
      try {
        await deps.expireSession(request.sessionId);
      } catch (error) {
        // A payment being confirmed right now cannot be expired: it is left alone.
        deps.log("session not expired", error instanceof Error ? error.message : error);
      }
    }
    return json({ status: "released" }, 200, cors);
  }

  if (!owned) return fail("invalid_request", { field: "consent_client_secret" });
  if (session!.status !== "open") return fail("checkout_closed");
  let consentId: string;
  try {
    consentId = await deps.recordWithdrawalConsent(user.id);
  } catch (error) {
    deps.log("consent not recorded", error instanceof Error ? error.message : error);
    return fail("server_error");
  }
  try {
    await deps.markSessionConsent(request.sessionId, consentId);
  } catch (error) {
    // Not blocking: the request is recorded, dated before the subscription exists.
    deps.log("consent not written to the session", error instanceof Error ? error.message : error);
  }
  return json({ status: "consented" }, 200, cors);
}

async function openPaymentStep(
  input: StudioSubscriptionInput,
  user: Member,
  origin: string,
  deps: StudioCheckoutDeps,
  fail: Fail,
  cors: Record<string, string>,
): Promise<Response> {
  if (!deps.publishableKey) {
    deps.log("STRIPE_PUBLISHABLE_KEY missing or not matching the secret key's mode");
    return fail("payment_unavailable");
  }

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

  try {
    const customerId = await deps.ensureCustomer(user.id, user.email);
    try {
      await deps.expireOpenSessions(customerId);
    } catch (error) {
      // Not blocking: a second paid subscription is detected by the webhook.
      deps.log("open sessions not expired", error instanceof Error ? error.message : error);
    }
    const expiresAt = Math.floor(deps.now() / 1000) + SESSION_MINUTES * 60;
    const session = await deps.createSession({
      customerId,
      priceId: price.stripePriceId,
      userId: user.id,
      plan: input.plan,
      interval: input.interval,
      locale: input.locale,
      returnUrl: studioReturnUrl(origin),
      expiresAt,
    });
    return json(
      {
        status: "payment",
        client_secret: session.clientSecret,
        publishable_key: deps.publishableKey,
        amount: price.amountMinor,
        currency: price.currency,
        expires_at: new Date(expiresAt * 1000).toISOString(),
      },
      200,
      cors,
    );
  } catch (error) {
    deps.log("Stripe checkout not created", error instanceof Error ? error.message : error);
    return fail("payment_unavailable");
  }
}
