import { requireEnv, serviceClient, stripeClient, type Stripe } from "../_shared/clients.ts";
import { hasInternalSecret } from "../_shared/internalAuth.ts";
import { accountStudioUrl, STUDIO_METADATA_KIND, STUDIO_SUBSCRIPTION_EVENTS } from "../_shared/studioBilling.ts";
import { toDecimalString } from "../_shared/money.ts";
import { handleSetup, type SetupDeps } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml). Internal only: the
 * caller sends EMAIL_INTERNAL_SECRET in `x-internal-secret` (the secret the
 * pg_cron jobs already use, read from Vault). See handler.ts.
 */

const supabase = serviceClient();
const stripe = stripeClient();
const site = requireEnv("SITE_URL");

const PRODUCT_NAMES = { essential: "Essential", artist: "Artist", atelier: "Atelier" } as const;

const deps: SetupDeps = {
  authorized: (req) => hasInternalSecret(req, Deno.env.get("EMAIL_INTERNAL_SECRET")),
  testMode: requireEnv("STRIPE_SECRET_KEY").startsWith("sk_test_"),

  async ensureProduct(plan) {
    const found = await stripe.products.search({ query: `metadata['kind']:'studio_plan' AND metadata['plan']:'${plan}' AND active:'true'` });
    if (found.data[0]) return found.data[0].id;
    const product = await stripe.products.create(
      {
        name: `Global Toothgems 3D Studio — ${PRODUCT_NAMES[plan]}`,
        metadata: { kind: "studio_plan", plan },
        tax_code: "txcd_10000000", // electronically supplied services
      },
      { idempotencyKey: `studio-product:${plan}` },
    );
    return product.id;
  },

  async ensurePrice({ productId, plan, interval, amountMinor, currency }) {
    const lookupKey = `studio_${plan}_${interval}`;
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const current = existing.data[0];
    if (
      current && current.product === productId && current.unit_amount === amountMinor &&
      current.currency === currency.toLowerCase() && current.recurring?.interval === interval && current.tax_behavior === "inclusive"
    ) {
      return current.id;
    }
    const price = await stripe.prices.create(
      {
        product: productId,
        currency: currency.toLowerCase(),
        unit_amount: amountMinor,
        recurring: { interval, interval_count: 1 },
        tax_behavior: "inclusive",
        lookup_key: lookupKey,
        transfer_lookup_key: true,
        metadata: { kind: "studio_plan", plan, interval },
      },
      { idempotencyKey: `studio-price:${lookupKey}:${amountMinor}:${currency}` },
    );
    if (current) await stripe.prices.update(current.id, { active: false });
    return price.id;
  },

  async ensurePortal(products) {
    const params = {
      business_profile: { headline: "Global Toothgems — 3D Studio" },
      default_return_url: accountStudioUrl(site),
      features: {
        customer_update: { enabled: false },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end" as const,
          cancellation_reason: {
            enabled: true,
            options: ["too_expensive", "missing_features", "unused", "switched_service", "other"] as (
              | "too_expensive"
              | "missing_features"
              | "unused"
              | "switched_service"
              | "other"
            )[],
          },
        },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price" as const],
          proration_behavior: "create_prorations" as const,
          products: products.map((p) => ({ product: p.productId, prices: p.priceIds })),
        },
      },
      metadata: { kind: "studio_portal" },
    };
    const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
    const existing = list.data.find((config) => config.metadata?.kind === "studio_portal");
    if (existing) {
      const updated = await stripe.billingPortal.configurations.update(existing.id, params);
      return updated.id;
    }
    const created = await stripe.billingPortal.configurations.create(params, { idempotencyKey: "studio-portal:v1" });
    return created.id;
  },

  async recordPrice({ plan, interval, amountMinor, currency, priceId }) {
    const retire = await supabase
      .from("studio_plan_prices")
      .update({ active: false })
      .eq("plan", plan)
      .eq("billing_interval", interval)
      .eq("active", true)
      .neq("stripe_price_id", priceId);
    if (retire.error) throw new Error(retire.error.message);
    const { error } = await supabase.from("studio_plan_prices").upsert(
      {
        plan,
        billing_interval: interval,
        amount: toDecimalString(amountMinor),
        currency,
        stripe_price_id: priceId,
        livemode: false,
        active: true,
      },
      { onConflict: "stripe_price_id" },
    );
    if (error) throw new Error(error.message);
  },

  async smokeSubscribe({ userId, plan, interval }) {
    const { data: price, error } = await supabase
      .from("studio_plan_prices")
      .select("stripe_price_id")
      .eq("plan", plan)
      .eq("billing_interval", interval)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!price) throw new Error("no active price for this plan");
    const known = await supabase.from("stripe_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    if (known.error) throw new Error(known.error.message);
    let customerId = known.data?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { user_id: userId, smoke_test: "true" } });
      const stored = await supabase.from("stripe_customers").insert({ user_id: userId, stripe_customer_id: customer.id, livemode: false });
      if (stored.error) throw new Error(stored.error.message);
      customerId = customer.id;
    }
    // Stripe's published test card.
    const method = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });
    const metadata = { kind: STUDIO_METADATA_KIND, user_id: userId, plan, interval, smoke_test: "true" };
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.stripe_price_id }],
      default_payment_method: method.id,
      metadata,
    });
    return { subscriptionId: sub.id, status: sub.status };
  },

  async smokeCancel({ subscriptionId, atPeriodEnd }) {
    const sub = atPeriodEnd
      ? await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true })
      : await stripe.subscriptions.cancel(subscriptionId);
    return { status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end };
  },

  async subscribeWebhookEvents() {
    const url = `${requireEnv("SUPABASE_URL").replace(/\/+$/, "")}/functions/v1/stripe-webhook`;
    const list = await stripe.webhookEndpoints.list({ limit: 100 });
    const endpoint = list.data.find((e) => e.url === url && !e.livemode);
    if (!endpoint) throw new Error(`no test-mode endpoint for ${url}`);
    const events = [...new Set([...endpoint.enabled_events, ...STUDIO_SUBSCRIPTION_EVENTS])];
    if (events.includes("*")) return { endpoint: endpoint.id, events: ["*"] };
    const updated = await stripe.webhookEndpoints.update(endpoint.id, {
      enabled_events: events as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
    });
    return { endpoint: updated.id, events: updated.enabled_events };
  },

  log: (message, detail) => console.error(`[studio-billing-setup] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleSetup(req, deps));
