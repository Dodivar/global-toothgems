import { corsHeaders, json, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import { accountStudioUrl, bearer, looksLikeJwt, type StudioInterval, type StudioLocale, type StudioPlan } from "../_shared/studioBilling.ts";
import {
  cancelRefusal,
  changeRefusal,
  chargedNow,
  parseStudioManageRequest,
  prorationInstant,
  resumeRefusal,
  STUDIO_CARD_METADATA_KIND,
  type ManagedSubscription,
  type StudioCancelReason,
} from "../_shared/studioManage.ts";

/**
 * POST /functions/v1/studio-manage-subscription   { action, …}  (the member's token)
 *
 * The member manages their 3D Studio subscription on our own page (decision
 * 112), in place of the Stripe customer portal, with the portal's rules
 * (`_shared/studioManage.ts`):
 *
 *   overview                     plan, price, status, period end, card, invoices
 *   preview  {plan, interval}    what the switch costs: now (interval change) or on the next invoice
 *   change   {plan, interval, proration_date?}
 *                                switched with create_prorations; a charge needing 3-D Secure
 *                                answers requires_action + the payment's client secret
 *   cancel   {reason?}           at the end of the period
 *   resume                       undoes a cancellation still to come
 *   card_start                   a setup-mode Checkout Session for the payment form
 *   card_saved {session_id}      that card becomes the default; an unpaid invoice is retried with it
 *
 * The account comes from the token, the subscription from `stripe_customers`
 * and `studio_subscriptions`, the price from `studio_plan_prices`. Nothing here
 * grants access: what Stripe applies comes back through the verified
 * `stripe-webhook` (`customer.subscription.updated`).
 */

export interface ManagedContext {
  customerId: string;
  subscriptionId: string;
  itemId: string;
  sub: ManagedSubscription;
  currentPeriodEnd: number | null;
  /** The current price, VAT included (minor units). */
  amountMinor: number | null;
  currency: string;
  /** The subscription's own card, when it has one (else the customer's default pays). */
  paymentMethodId: string | null;
}

export interface PreviewFigures {
  /** Charged today (minor units): an interval switch; 0 otherwise. */
  dueNow: number;
  /** The next invoice after the switch, adjustments included (minor units). */
  nextAmount: number;
  /** When it is due (unix seconds). */
  nextDate: number | null;
  /** Credit left on the account after the switch (minor units, ≥ 0). */
  credit: number;
  currency: string;
}

/** What Stripe did with a charge (a plan change, or an unpaid invoice retried with a new card). */
export type ChargeOutcome = { kind: "done" } | { kind: "requires_action"; clientSecret: string } | { kind: "payment_failed" };

export interface CardSession {
  status: string | null;
  kind: string | null;
  userId: string | null;
  paymentMethodId: string | null;
}

export interface StudioManageDeps {
  origins: SiteOrigins;
  /** Mounts the payment form in the browser (card, 3-D Secure); null when not configured. */
  publishableKey: string | null;
  userFromToken(token: string): Promise<string | null>;
  customerOf(userId: string): Promise<string | null>;
  /** The member's latest Studio subscription, read back from Stripe; null without one. */
  subscriptionOf(userId: string, customerId: string): Promise<ManagedContext | null>;
  overview(userId: string, customerId: string, context: ManagedContext | null): Promise<Record<string, unknown>>;
  priceOf(plan: StudioPlan, interval: StudioInterval): Promise<string | null>;
  preview(context: ManagedContext, priceId: string, prorationDate: number): Promise<PreviewFigures>;
  change(context: ManagedContext, priceId: string, prorationDate: number): Promise<ChargeOutcome>;
  cancel(context: ManagedContext, reason: StudioCancelReason | null): Promise<void>;
  resume(context: ManagedContext): Promise<void>;
  startCardSession(args: { customerId: string; userId: string; locale: StudioLocale; returnUrl: string; expiresAt: number }): Promise<string>;
  cardSession(sessionId: string): Promise<CardSession | null>;
  saveCard(context: ManagedContext, paymentMethodId: string): Promise<ChargeOutcome>;
  now(): number;
  log(message: string, detail?: unknown): void;
}

const MAX_BODY_BYTES = 2048;
/** Stripe's shortest Checkout Session life. */
const CARD_SESSION_SECONDS = 30 * 60;
const RUNNING = new Set(["active", "trialing", "past_due", "unpaid"]);

async function readBody(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function chargeAnswer(outcome: ChargeOutcome, publishableKey: string | null, done: string, cors: Record<string, string>): Response {
  switch (outcome.kind) {
    case "done":
      return json({ status: done }, 200, cors);
    case "requires_action":
      // The browser completes the bank's check (3-D Secure) with Stripe.js; the change applies once paid.
      return publishableKey
        ? json({ status: "requires_action", client_secret: outcome.clientSecret, publishable_key: publishableKey }, 200, cors)
        : json({ error: "payment_failed" }, 402, cors);
    case "payment_failed":
      return json({ error: "payment_failed" }, 402, cors);
  }
}

export async function handleStudioManage(req: Request, deps: StudioManageDeps): Promise<Response> {
  const requestOrigin = req.headers.get("origin");
  const cors = corsHeaders(deps.origins, requestOrigin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return json({ error: "sign_in_required" }, 401, cors);
  const parsed = parseStudioManageRequest(await readBody(req));
  if (!parsed.ok) return json({ error: "invalid_request", field: parsed.field }, 400, cors);
  const request = parsed.value;

  try {
    const userId = await deps.userFromToken(token);
    if (!userId) return json({ error: "session_expired" }, 401, cors);
    const customerId = await deps.customerOf(userId);
    const context = customerId ? await deps.subscriptionOf(userId, customerId) : null;

    if (request.action === "overview") {
      if (!customerId) return json({ subscription: null, card: null, invoices: [] }, 200, cors);
      return json(await deps.overview(userId, customerId, context), 200, cors);
    }
    if (!customerId || !context) return json({ error: "no_subscription" }, 409, cors);

    switch (request.action) {
      case "preview":
      case "change": {
        const refusal = changeRefusal(context.sub, request.plan, request.interval);
        if (refusal) return json({ error: refusal }, 409, cors);
        const priceId = await deps.priceOf(request.plan, request.interval);
        if (!priceId) return json({ error: "plan_unavailable" }, 409, cors);
        const nowSeconds = Math.floor(deps.now() / 1000);
        if (request.action === "preview") {
          const figures = await deps.preview(context, priceId, nowSeconds);
          return json(
            {
              charged_now: chargedNow(context.sub.interval, request.interval),
              due_now: figures.dueNow,
              next_amount: figures.nextAmount,
              next_date: figures.nextDate,
              credit: figures.credit,
              currency: figures.currency,
              proration_date: nowSeconds,
            },
            200,
            cors,
          );
        }
        const outcome = await deps.change(context, priceId, prorationInstant(request.prorationDate, nowSeconds));
        return chargeAnswer(outcome, deps.publishableKey, "updated", cors);
      }
      case "cancel": {
        const refusal = cancelRefusal(context.sub);
        if (refusal) return json({ error: refusal }, 409, cors);
        await deps.cancel(context, request.reason);
        return json({ status: "canceled" }, 200, cors);
      }
      case "resume": {
        const refusal = resumeRefusal(context.sub);
        if (refusal) return json({ error: refusal }, 409, cors);
        await deps.resume(context);
        return json({ status: "resumed" }, 200, cors);
      }
      case "card_start": {
        if (!RUNNING.has(context.sub.status)) return json({ error: "not_active" }, 409, cors);
        if (!deps.publishableKey) return json({ error: "unavailable" }, 503, cors);
        const expiresAt = Math.floor(deps.now() / 1000) + CARD_SESSION_SECONDS;
        const clientSecret = await deps.startCardSession({
          customerId,
          userId,
          locale: request.locale,
          // A bank that redirects brings the member back here; the page then saves the card.
          returnUrl: `${accountStudioUrl(returnOrigin(deps.origins, requestOrigin))}?card=saved&session_id={CHECKOUT_SESSION_ID}`,
          expiresAt,
        });
        return json({ client_secret: clientSecret, publishable_key: deps.publishableKey, expires_at: expiresAt }, 200, cors);
      }
      case "card_saved": {
        const session = await deps.cardSession(request.sessionId);
        if (!session || session.kind !== STUDIO_CARD_METADATA_KIND || session.userId !== userId) {
          return json({ error: "invalid_request" }, 400, cors);
        }
        if (session.status !== "complete" || !session.paymentMethodId) return json({ error: "card_not_saved" }, 409, cors);
        const outcome = await deps.saveCard(context, session.paymentMethodId);
        return chargeAnswer(outcome, deps.publishableKey, "card_saved", cors);
      }
    }
  } catch (error) {
    deps.log(`${request.action} failed`, error instanceof Error ? error.message : error);
    return json({ error: "unavailable" }, 502, cors);
  }
}
