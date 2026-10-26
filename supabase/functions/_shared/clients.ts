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

/**
 * The publishable key mounts Stripe's payment form in the browser. It must belong
 * to the same mode as the secret key (test with test, live with live), otherwise
 * Stripe.js cannot use what the function opened: a mismatch counts as not configured.
 */
export function matchingPublishableKey(): string | null {
  const publishable = Deno.env.get("STRIPE_PUBLISHABLE_KEY")?.trim() ?? "";
  const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim() ?? "";
  const mode = (key: string) => /^(?:pk|sk|rk)_(test|live)_/.exec(key)?.[1] ?? null;
  return publishable.startsWith("pk_") && mode(publishable) !== null && mode(publishable) === mode(secret) ? publishable : null;
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

export type { Stripe, SupabaseClient };
