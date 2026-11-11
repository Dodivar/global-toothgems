import Stripe from "npm:stripe@18.5.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  keyMode,
  type StripeAccount,
  StripeAccountNotConfigured,
  stripePublishableKey,
  stripeSecretKey,
  type WebhookEndpoint,
  webhookEndpoints,
} from "./stripeAccounts.ts";

/**
 * Server-side clients. The secrets come from the Edge Function environment
 * (`supabase secrets set`, see functions/.env.example) — never from the
 * repository or the browser. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 * provided by Supabase to every deployed function.
 */

export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const readEnv = (name: string) => Deno.env.get(name);

/**
 * The Stripe client of one business (decision 135, `stripeAccounts.ts`): `studio`
 * (the publisher's account, `STRIPE_*`) or `shop` (the seller's, `SHOP_STRIPE_*`,
 * borrowing the Studio's test keys until it exists). Throws
 * `StripeAccountNotConfigured` when the account has no usable key.
 */
export function stripeClient(account: StripeAccount): Stripe {
  return new Stripe(stripeSecretKey(readEnv, account), {
    // Pinned: a Stripe dashboard upgrade must not change what these functions receive.
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}

/**
 * The client of an account, created on first use: a function whose account is
 * not configured still starts (and answers its own "unavailable" error) instead
 * of failing at boot. The error is `StripeAccountNotConfigured`.
 */
export function lazyStripeClient(account: StripeAccount): () => Stripe {
  let client: Stripe | null = null;
  return () => (client ??= stripeClient(account));
}

export { StripeAccountNotConfigured };

/**
 * The publishable key mounting Stripe's payment form in the browser for an
 * account. It must belong to the same account and mode as the secret key,
 * otherwise Stripe.js cannot use what the function opened: a mismatch counts as
 * not configured.
 */
export function matchingPublishableKey(account: StripeAccount): string | null {
  return stripePublishableKey(readEnv, account);
}

/** Whether the secret key of an account is a test key (Studio billing setup). */
export function stripeTestMode(account: StripeAccount): boolean {
  return keyMode(stripeSecretKey(readEnv, account)) === "test";
}

/** The webhook signing secrets `stripe-webhook` accepts, with the businesses each may carry. */
export function stripeWebhookEndpoints(): WebhookEndpoint[] {
  return webhookEndpoints(readEnv);
}

/** Signature verification with Web Crypto (Deno has no Node `crypto` HMAC in the Stripe SDK path). */
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();

/** Service-role client: bypasses RLS, so only these functions ever hold it. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * A client acting AS the caller: the publishable/anon key plus the caller's own
 * JWT, so every read and write goes through RLS and the guard triggers exactly
 * as if the browser had made it. SUPABASE_ANON_KEY is provided by Supabase.
 */
export function callerClient(token: string): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type { Stripe, StripeAccount, SupabaseClient, WebhookEndpoint };
