import Stripe from "npm:stripe@18.5.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

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

export function stripeClient(): Stripe {
  return new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    // Pinned: a Stripe dashboard upgrade must not change what these functions receive.
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}

/** Signature verification with Web Crypto (Deno has no Node `crypto` HMAC in the Stripe SDK path). */
export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();

/** Service-role client: bypasses RLS, so only these functions ever hold it. */
export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type { Stripe, SupabaseClient };
