import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./env";

export { isSupabaseConfigured };

/**
 * The browser's single Supabase client.
 *
 * It only ever carries the publishable key: everything it can read or write is
 * decided by Row Level Security in Postgres, never by this code. Privileged
 * operations (order creation, payment confirmation, gift card codes) go
 * through server code holding the service role — never through here.
 *
 * The session lives in cookies (`@supabase/ssr`), so the proxy and the server
 * routes read the same session as the browser; e-mail links use the PKCE flow
 * and land on `/auth/confirm` (docs/migration-nextjs.md, phase 2).
 *
 * When the two variables are missing the app keeps running on its mock data;
 * `supabase` is then `null` and callers check `isSupabaseConfigured`.
 */

export type TypedSupabaseClient = SupabaseClient<Database>;

const inBrowser = typeof window !== "undefined";

export const supabase: TypedSupabaseClient | null =
  isSupabaseConfigured && inBrowser ? createBrowserClient<Database>(supabaseUrl, supabasePublishableKey) : null;

/** For code paths that cannot run without the database. */
export function requireSupabase(): TypedSupabaseClient {
  if (!supabase) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return supabase;
}

/**
 * Until the move to cookies, supabase-js kept the session in `localStorage`
 * under the key the cookies now use (`sb-<project ref>-auth-token`). A member
 * signed in before the switch is carried over once: the stored tokens open a
 * cookie session, then the old entry is removed. Without it, every member
 * would be signed out by the migration.
 */
async function importLegacySession(client: TypedSupabaseClient): Promise<void> {
  const key = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
    if (raw === null) return;
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}-code-verifier`);
  } catch {
    return; // Storage blocked: nothing was kept there either.
  }

  const { data } = await client.auth.getSession();
  if (data.session) return; // A cookie session already exists; it wins.

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return;
  }
  const tokens = stored as { access_token?: unknown; refresh_token?: unknown } | null;
  if (typeof tokens?.access_token !== "string" || typeof tokens.refresh_token !== "string") return;
  // An expired pair is refreshed here; a revoked one fails and the member signs in again.
  await client.auth.setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token });
}

/**
 * Settles once a pre-migration session has been carried over (or there was
 * none). Auth providers wait for it before reading the session, so a member is
 * not bounced to the sign-in page while it is imported.
 */
export const sessionReady: Promise<void> = supabase ? importLegacySession(supabase).catch(() => undefined) : Promise.resolve();
