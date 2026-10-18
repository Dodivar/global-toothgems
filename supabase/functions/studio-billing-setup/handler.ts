import { json } from "../_shared/http.ts";
import { STUDIO_INTERVALS, STUDIO_PLANS, type StudioInterval, type StudioPlan } from "../_shared/studioBilling.ts";

/**
 * POST /functions/v1/studio-billing-setup   (internal: `x-internal-secret`)
 *   { currency: "EUR", prices: [{ plan, interval, amount_minor }, …] }
 *
 * Creates — or finds again — the Stripe objects the 3D Studio subscriptions are
 * sold with, then records the prices in `studio_plan_prices`:
 *   * one Product per plan (metadata kind = studio_plan, plan);
 *   * one recurring Price per plan and interval, VAT included
 *     (`tax_behavior: inclusive`), with the lookup key `studio_<plan>_<interval>`;
 *     an existing Price with the same amount is reused, a different amount
 *     gets a new Price (Stripe Prices are immutable) and the old row is retired;
 *   * the customer portal configuration (metadata kind = studio_portal):
 *     switch plan or interval, update the card, invoices, cancel at period end.
 *
 * The amounts are the request's (decided by the owner), never this code's.
 *
 * Smoke test of the whole chain, without a browser (test mode, test card
 * `pm_card_visa`), for a given account:
 *   { action: "smoke_subscribe", user_id, plan, interval }  → a real test-mode
 *     subscription created on Stripe; access comes only from the webhook it triggers
 *   { action: "smoke_cancel", subscription_id, at_period_end }  → cancels it
 *   { action: "webhook_events" }  → adds the subscription events to the
 *     test-mode endpoint of `stripe-webhook` (asked by the owner, 2026-10-18)
 *
 * TEST MODE ONLY: refused when the Stripe key is not `sk_test_…` (live prices
 * are the owner's call, at launch). Running it twice changes nothing.
 */

export interface PriceRequest {
  plan: StudioPlan;
  interval: StudioInterval;
  amountMinor: number;
}

export interface SetupInput {
  currency: string;
  prices: PriceRequest[];
}

export interface SetupDeps {
  authorized(req: Request): Promise<boolean>;
  testMode: boolean;
  /** The plan's Product id, created when missing. */
  ensureProduct(plan: StudioPlan): Promise<string>;
  /** The active Price for this lookup key and amount, created when missing. */
  ensurePrice(args: { productId: string; plan: StudioPlan; interval: StudioInterval; amountMinor: number; currency: string }): Promise<string>;
  ensurePortal(products: { productId: string; priceIds: string[] }[]): Promise<string>;
  recordPrice(args: { plan: StudioPlan; interval: StudioInterval; amountMinor: number; currency: string; priceId: string }): Promise<void>;
  smokeSubscribe(args: { userId: string; plan: StudioPlan; interval: StudioInterval }): Promise<{ subscriptionId: string; status: string }>;
  smokeCancel(args: { subscriptionId: string; atPeriodEnd: boolean }): Promise<{ status: string; cancelAtPeriodEnd: boolean }>;
  /** Adds the subscription events to the test-mode endpoint of `stripe-webhook`, keeping its other events. */
  subscribeWebhookEvents(): Promise<{ endpoint: string; events: string[] }>;
  log(message: string, detail?: unknown): void;
}

export function parseSetupInput(body: unknown): SetupInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { currency, prices, action } = body as Record<string, unknown>;
  if (action !== undefined && action !== "setup") return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  if (!Array.isArray(prices) || prices.length === 0 || prices.length > STUDIO_PLANS.length * STUDIO_INTERVALS.length) return null;
  const seen = new Set<string>();
  const parsed: PriceRequest[] = [];
  for (const entry of prices) {
    if (!entry || typeof entry !== "object") return null;
    const { plan, interval, amount_minor } = entry as Record<string, unknown>;
    if (!(STUDIO_PLANS as readonly unknown[]).includes(plan)) return null;
    if (!(STUDIO_INTERVALS as readonly unknown[]).includes(interval)) return null;
    if (typeof amount_minor !== "number" || !Number.isInteger(amount_minor) || amount_minor <= 0 || amount_minor > 1_000_000) return null;
    const key = `${plan}:${interval}`;
    if (seen.has(key)) return null;
    seen.add(key);
    parsed.push({ plan: plan as StudioPlan, interval: interval as StudioInterval, amountMinor: amount_minor });
  }
  return { currency, prices: parsed };
}

export async function handleSetup(req: Request, deps: SetupDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await deps.authorized(req))) return json({ error: "unauthorized" }, 401);
  if (!deps.testMode) return json({ error: "test_mode_only" }, 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const action = body && typeof body === "object" ? (body as Record<string, unknown>).action : undefined;
  if (action === "smoke_subscribe" || action === "smoke_cancel") return smoke(body as Record<string, unknown>, deps);
  if (action === "webhook_events") {
    try {
      return json({ result: "ok", ...(await deps.subscribeWebhookEvents()) }, 200);
    } catch (error) {
      deps.log("webhook events not added", error instanceof Error ? error.message : error);
      return json({ error: "webhook_failed", message: error instanceof Error ? error.message.slice(0, 300) : "unknown" }, 500);
    }
  }

  const input = parseSetupInput(body);
  if (!input) return json({ error: "invalid_request" }, 400);

  try {
    const products = new Map<StudioPlan, { productId: string; priceIds: string[] }>();
    const recorded: Record<string, string> = {};
    for (const price of input.prices) {
      let product = products.get(price.plan);
      if (!product) {
        product = { productId: await deps.ensureProduct(price.plan), priceIds: [] };
        products.set(price.plan, product);
      }
      const priceId = await deps.ensurePrice({ ...price, productId: product.productId, currency: input.currency });
      product.priceIds.push(priceId);
      await deps.recordPrice({ ...price, currency: input.currency, priceId });
      recorded[`${price.plan}_${price.interval}`] = priceId;
    }
    const portal = await deps.ensurePortal([...products.values()]);
    return json({ status: "ok", prices: recorded, portal }, 200);
  } catch (error) {
    deps.log("setup failed", error instanceof Error ? error.message : error);
    return json({ error: "setup_failed", message: error instanceof Error ? error.message.slice(0, 300) : "unknown" }, 500);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function smoke(body: Record<string, unknown>, deps: SetupDeps): Promise<Response> {
  try {
    if (body.action === "smoke_subscribe") {
      const { user_id, plan, interval } = body;
      if (typeof user_id !== "string" || !UUID_RE.test(user_id)) return json({ error: "invalid_request", field: "user_id" }, 400);
      if (!(STUDIO_PLANS as readonly unknown[]).includes(plan)) return json({ error: "invalid_request", field: "plan" }, 400);
      if (!(STUDIO_INTERVALS as readonly unknown[]).includes(interval)) return json({ error: "invalid_request", field: "interval" }, 400);
      const result = await deps.smokeSubscribe({ userId: user_id.toLowerCase(), plan: plan as StudioPlan, interval: interval as StudioInterval });
      return json({ result: "ok", ...result }, 200);
    }
    const { subscription_id, at_period_end } = body;
    if (typeof subscription_id !== "string" || !/^sub_[A-Za-z0-9]{6,250}$/.test(subscription_id)) {
      return json({ error: "invalid_request", field: "subscription_id" }, 400);
    }
    const result = await deps.smokeCancel({ subscriptionId: subscription_id, atPeriodEnd: at_period_end !== false });
    return json({ result: "ok", ...result }, 200);
  } catch (error) {
    deps.log("smoke test failed", error instanceof Error ? error.message : error);
    return json({ error: "smoke_failed", message: error instanceof Error ? error.message.slice(0, 300) : "unknown" }, 500);
  }
}
