import { requireEnv, serviceClient, stripeClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { toMinorUnits } from "../_shared/money.ts";
import {
  BLOCKING_STATUSES,
  STUDIO_CONSENT_PURPOSE,
  STUDIO_METADATA_KIND,
  STUDIO_WITHDRAWAL_CONSENT,
} from "../_shared/studioBilling.ts";
import { handleStudioCheckout, type StudioCheckoutDeps } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml), like
 * create-checkout-session: the member's token is checked here.
 */

const supabase = serviceClient();
const stripe = stripeClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));

/**
 * The publishable key mounts the payment form in the browser. It must belong to
 * the same mode as the secret key (test with test, live with live), otherwise
 * Stripe.js cannot open the session: a mismatch counts as not configured.
 */
function matchingPublishableKey(): string | null {
  const publishable = Deno.env.get("STRIPE_PUBLISHABLE_KEY")?.trim() ?? "";
  const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim() ?? "";
  const mode = (key: string) => /^(?:pk|sk|rk)_(test|live)_/.exec(key)?.[1] ?? null;
  return publishable.startsWith("pk_") && mode(publishable) !== null && mode(publishable) === mode(secret) ? publishable : null;
}

async function storedCustomer(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("stripe_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.stripe_customer_id ?? null;
}

const deps: StudioCheckoutDeps = {
  origins,
  publishableKey: matchingPublishableKey(),

  async userFromToken(token) {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
  },

  async termsAccepted(userId) {
    const { data, error } = await supabase
      .from("consent_records")
      .select("id")
      .eq("user_id", userId)
      .eq("purpose", "terms")
      .eq("granted", true)
      .limit(1);
    if (error) throw new Error(error.message);
    return data.length > 0;
  },

  async hasBlockingSubscription(userId) {
    const { data, error } = await supabase
      .from("studio_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("status", [...BLOCKING_STATUSES])
      .limit(1);
    if (error) throw new Error(error.message);
    return data.length > 0;
  },

  async planPrice(plan, interval) {
    const { data, error } = await supabase
      .from("studio_plan_prices")
      .select("stripe_price_id, amount, currency")
      .eq("plan", plan)
      .eq("billing_interval", interval)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { stripePriceId: data.stripe_price_id, amountMinor: toMinorUnits(data.amount), currency: data.currency } : null;
  },

  async recordWithdrawalConsent(userId) {
    const { data, error } = await supabase
      .from("consent_records")
      .insert({
        user_id: userId,
        purpose: STUDIO_CONSENT_PURPOSE,
        granted: true,
        policy_version: STUDIO_WITHDRAWAL_CONSENT.version,
        source: "checkout",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  },

  async ensureCustomer(userId, email) {
    const known = await storedCustomer(userId);
    if (known) return known;
    // The idempotency key makes concurrent first calls share one Stripe customer.
    const customer = await stripe.customers.create(
      { email: email ?? undefined, metadata: { user_id: userId } },
      { idempotencyKey: `studio-customer:${userId}` },
    );
    const { error } = await supabase
      .from("stripe_customers")
      .upsert({ user_id: userId, stripe_customer_id: customer.id, livemode: customer.livemode }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    const stored = await storedCustomer(userId);
    if (!stored) throw new Error("Stripe customer not stored");
    return stored;
  },

  async expireOpenSessions(customerId) {
    const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 20 });
    let expired = 0;
    for (const session of open.data) {
      if (session.mode !== "subscription" || session.metadata?.kind !== STUDIO_METADATA_KIND) continue;
      await stripe.checkout.sessions.expire(session.id);
      expired += 1;
    }
    return expired;
  },

  async createSession(params) {
    const metadata = {
      kind: STUDIO_METADATA_KIND,
      user_id: params.userId,
      plan: params.plan,
      interval: params.interval,
    };
    const session = await stripe.checkout.sessions.create({
      // The payment form (Payment Element) is mounted inside our own page, like the shop's checkout.
      ui_mode: "custom",
      mode: "subscription",
      customer: params.customerId,
      client_reference_id: params.userId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      locale: params.locale,
      metadata,
      subscription_data: { metadata },
      expires_at: params.expiresAt,
      return_url: params.returnUrl,
    });
    if (!session.client_secret) throw new Error("Stripe returned a session without client secret");
    return { id: session.id, clientSecret: session.client_secret };
  },

  async retrieveSession(sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return {
        clientSecret: session.client_secret,
        status: session.status,
        kind: session.metadata?.kind ?? null,
        userId: session.metadata?.user_id ?? null,
      };
    } catch (error) {
      if (error instanceof Error && "statusCode" in error && (error as { statusCode?: number }).statusCode === 404) return null;
      throw error;
    }
  },

  async markSessionConsent(sessionId, consentId) {
    // Merged into the existing metadata (kind, user, plan, interval stay).
    await stripe.checkout.sessions.update(sessionId, {
      metadata: { withdrawal_consent_id: consentId, withdrawal_consent_version: STUDIO_WITHDRAWAL_CONSENT.version },
    });
  },

  async expireSession(sessionId) {
    await stripe.checkout.sessions.expire(sessionId);
  },

  now: () => Date.now(),
  log: (message, detail) => console.error(`[create-studio-subscription] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleStudioCheckout(req, deps));
