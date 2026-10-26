import type Stripe from "npm:stripe@18.5.0";
import { matchingPublishableKey, requireEnv, serviceClient, stripeClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { STUDIO_METADATA_KIND, type StudioInterval, type StudioPlan } from "../_shared/studioBilling.ts";
import { STUDIO_CARD_METADATA_KIND } from "../_shared/studioManage.ts";
import { type ChargeOutcome, handleStudioManage, type ManagedContext, type StudioManageDeps } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): the member's token
 * is checked here, like the other Studio billing functions.
 */

const supabase = serviceClient();
const stripe = stripeClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));
const log = (message: string, detail?: unknown) => console.error(`[studio-manage-subscription] ${message}`, detail ?? "");

const RUNNING = ["active", "trialing", "past_due", "unpaid"];

const idOf = (value: string | { id?: string } | null | undefined): string | null =>
  typeof value === "string" ? value : value?.id ?? null;

async function planOfPrice(priceId: string | null): Promise<{ plan: StudioPlan; interval: StudioInterval } | null> {
  if (!priceId) return null;
  const { data, error } = await supabase
    .from("studio_plan_prices")
    .select("plan, billing_interval")
    .eq("stripe_price_id", priceId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { plan: data.plan as StudioPlan, interval: data.billing_interval as StudioInterval } : null;
}

/** The member's Studio subscriptions, the running one first, then the newest. */
async function subscriptionIdsOf(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("studio_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const running = rows.filter((row) => RUNNING.includes(row.status));
  return [...running, ...rows.filter((row) => !RUNNING.includes(row.status))].map((row) => row.stripe_subscription_id);
}

/**
 * Where an invoice's payment stands: paid, waiting for the bank's check
 * (3-D Secure, its client secret for Stripe.js), or failed.
 */
async function invoiceCharge(invoiceId: string): Promise<ChargeOutcome> {
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["confirmation_secret"] });
  if (invoice.status === "paid") return { kind: "done" };
  const secret = invoice.confirmation_secret?.client_secret ?? null;
  if (!secret || !secret.startsWith("pi_")) return { kind: "payment_failed" };
  const intent = await stripe.paymentIntents.retrieve(secret.split("_secret_")[0]);
  if (intent.status === "succeeded" || intent.status === "processing") return { kind: "done" };
  if (intent.status === "requires_action" || intent.status === "requires_confirmation") return { kind: "requires_action", clientSecret: secret };
  return { kind: "payment_failed" };
}

function cardOf(method: Stripe.PaymentMethod | null) {
  if (!method) return null;
  if (method.card) {
    return { type: "card", brand: method.card.brand, last4: method.card.last4, exp_month: method.card.exp_month, exp_year: method.card.exp_year };
  }
  return { type: method.type, brand: null, last4: null, exp_month: null, exp_year: null };
}

const deps: StudioManageDeps = {
  origins,
  publishableKey: matchingPublishableKey(),

  async userFromToken(token) {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },

  async customerOf(userId) {
    const { data, error } = await supabase.from("stripe_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.stripe_customer_id ?? null;
  },

  async subscriptionOf(userId, customerId) {
    const [subscriptionId] = await subscriptionIdsOf(userId);
    if (!subscriptionId) return null;
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    // Only the Studio subscription this site created for this very customer.
    if (idOf(sub.customer) !== customerId || sub.metadata?.kind !== STUDIO_METADATA_KIND) return null;
    const item = sub.items.data[0];
    if (!item) return null;
    const known = await planOfPrice(item.price.id);
    return {
      customerId,
      subscriptionId: sub.id,
      itemId: item.id,
      sub: {
        status: sub.status,
        plan: known?.plan ?? null,
        interval: known?.interval ?? null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        pendingUpdate: sub.pending_update !== null,
      },
      currentPeriodEnd: item.current_period_end ?? null,
      amountMinor: item.price.unit_amount ?? null,
      currency: item.price.currency.toUpperCase(),
      paymentMethodId: idOf(sub.default_payment_method),
    } satisfies ManagedContext;
  },

  // The invoices are ours (decision 115): the page reads them from the database, not from Stripe.
  async overview(_userId, customerId, context) {
    const customer = await stripe.customers.retrieve(customerId);
    const customerMethod = customer.deleted ? null : idOf(customer.invoice_settings?.default_payment_method ?? null);
    const methodId = context?.paymentMethodId ?? customerMethod;
    const method = methodId ? await stripe.paymentMethods.retrieve(methodId) : null;

    return {
      subscription: context
        ? {
          plan: context.sub.plan,
          interval: context.sub.interval,
          status: context.sub.status,
          cancel_at_period_end: context.sub.cancelAtPeriodEnd,
          current_period_end: context.currentPeriodEnd,
          amount: context.amountMinor,
          currency: context.currency,
          pending_update: context.sub.pendingUpdate,
        }
        : null,
      card: cardOf(method),
    };
  },

  async priceOf(plan, interval) {
    const { data, error } = await supabase
      .from("studio_plan_prices")
      .select("stripe_price_id")
      .eq("plan", plan)
      .eq("billing_interval", interval)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.stripe_price_id ?? null;
  },

  async preview(context, priceId, prorationDate) {
    const invoice = await stripe.invoices.createPreview({
      customer: context.customerId,
      subscription: context.subscriptionId,
      subscription_details: {
        items: [{ id: context.itemId, price: priceId }],
        proration_behavior: "create_prorations",
        proration_date: prorationDate,
      },
    });
    const target = await stripe.prices.retrieve(priceId);
    const lineEnds = invoice.lines.data.map((line) => line.period?.end ?? 0);
    const credit = invoice.ending_balance !== null && invoice.ending_balance < 0 ? -invoice.ending_balance : 0;
    const resetsPeriod = context.sub.interval !== null && target.recurring?.interval !== context.sub.interval;
    return resetsPeriod
      ? {
        // Invoiced at once: today's amount, then the new price from the new period's end.
        dueNow: invoice.amount_due,
        nextAmount: target.unit_amount ?? 0,
        nextDate: lineEnds.length ? Math.max(...lineEnds) : null,
        credit,
        currency: invoice.currency.toUpperCase(),
      }
      : {
        // The upcoming renewal, the adjustment for the rest of this period included.
        dueNow: 0,
        nextAmount: invoice.amount_due,
        nextDate: context.currentPeriodEnd,
        credit,
        currency: invoice.currency.toUpperCase(),
      };
  },

  async change(context, priceId, prorationDate) {
    const updated = await stripe.subscriptions.update(
      context.subscriptionId,
      {
        items: [{ id: context.itemId, price: priceId }],
        proration_behavior: "create_prorations",
        proration_date: prorationDate,
        // An interval switch is charged at once: applied only once paid (3-D Secure included).
        payment_behavior: "pending_if_incomplete",
      },
      { idempotencyKey: `studio-change:${context.subscriptionId}:${priceId}:${prorationDate}` },
    );
    if (!updated.pending_update) return { kind: "done" };
    const invoiceId = idOf(updated.latest_invoice);
    if (!invoiceId) return { kind: "payment_failed" };
    const outcome = await invoiceCharge(invoiceId);
    if (outcome.kind === "payment_failed") {
      // Nothing changes: voiding the invoice discards the waiting change at once.
      await stripe.invoices.voidInvoice(invoiceId).catch((error) => log("waiting change not voided", error?.message ?? error));
    }
    return outcome;
  },

  async cancel(context, reason) {
    await stripe.subscriptions.update(context.subscriptionId, {
      cancel_at_period_end: true,
      ...(reason ? { cancellation_details: { feedback: reason } } : {}),
    });
  },

  async resume(context) {
    await stripe.subscriptions.update(context.subscriptionId, { cancel_at_period_end: false });
  },

  async startCardSession({ customerId, userId, locale, returnUrl, expiresAt }) {
    const metadata = { kind: STUDIO_CARD_METADATA_KIND, user_id: userId };
    const session = await stripe.checkout.sessions.create({
      // The same payment form as the subscription's, in setup mode: nothing is charged.
      ui_mode: "custom",
      mode: "setup",
      currency: "eur",
      customer: customerId,
      payment_method_types: ["card"],
      locale,
      metadata,
      setup_intent_data: { metadata },
      expires_at: expiresAt,
      return_url: returnUrl,
    });
    if (!session.client_secret) throw new Error("Stripe returned a session without client secret");
    return session.client_secret;
  },

  async cardSession(sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent"] });
      const intent = session.setup_intent && typeof session.setup_intent === "object" ? session.setup_intent : null;
      return {
        status: session.status,
        kind: session.metadata?.kind ?? null,
        userId: session.metadata?.user_id ?? null,
        paymentMethodId: intent?.status === "succeeded" ? idOf(intent.payment_method) : null,
      };
    } catch (error) {
      if (error instanceof Error && "statusCode" in error && (error as { statusCode?: number }).statusCode === 404) return null;
      throw error;
    }
  },

  async saveCard(context, paymentMethodId) {
    await stripe.customers.update(context.customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    const sub = await stripe.subscriptions.update(context.subscriptionId, { default_payment_method: paymentMethodId });
    if (sub.status !== "past_due" && sub.status !== "unpaid") return { kind: "done" };
    // A payment to fix: the unpaid invoice is retried at once with the new card.
    const invoiceId = idOf(sub.latest_invoice);
    if (!invoiceId) return { kind: "done" };
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      if (invoice.status !== "open") return { kind: "done" };
      await stripe.invoices.pay(invoiceId, { payment_method: paymentMethodId });
      return { kind: "done" };
    } catch (error) {
      log("unpaid invoice not settled with the new card", error instanceof Error ? error.message : error);
      return invoiceCharge(invoiceId);
    }
  },

  now: () => Date.now(),
  log,
};

Deno.serve((req) => handleStudioManage(req, deps));
