import { requireEnv, serviceClient, stripeClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { toMinorUnits } from "../_shared/money.ts";
import { BLOCKING_STATUSES, STUDIO_METADATA_KIND } from "../_shared/studioBilling.ts";
import { handleStudioCheckout, type StudioCheckoutDeps } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml), like
 * create-checkout-session: the member's token is checked here.
 */

const supabase = serviceClient();
const stripe = stripeClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));

const SUBMIT_TEXT = {
  fr: "Votre abonnement au Studio 3D commence dès le paiement. Vous pouvez le résilier à tout moment depuis votre compte : il prend fin à la fin de la période payée.",
  en: "Your 3D Studio subscription starts as soon as you pay. You can cancel it at any time from your account: it ends at the close of the paid period.",
} as const;

async function storedCustomer(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("stripe_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.stripe_customer_id ?? null;
}

const deps: StudioCheckoutDeps = {
  origins,

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
    const metadata = { kind: STUDIO_METADATA_KIND, user_id: params.userId, plan: params.plan, interval: params.interval };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: params.customerId,
      client_reference_id: params.userId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      locale: params.locale,
      metadata,
      subscription_data: { metadata },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      custom_text: { submit: { message: SUBMIT_TEXT[params.locale] } },
    });
    if (!session.url) throw new Error("Stripe returned a session without url");
    return { id: session.id, url: session.url };
  },

  log: (message, detail) => console.error(`[create-studio-subscription] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleStudioCheckout(req, deps));
