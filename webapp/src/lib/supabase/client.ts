import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * The browser's single Supabase client.
 *
 * It only ever carries the publishable key: everything it can read or write is
 * decided by Row Level Security in Postgres, never by this code. Privileged
 * operations (order creation, payment confirmation, gift card codes) go
 * through server code holding the service role — never through here.
 *
 * When the two variables are missing the prototype keeps running on its mock
 * data; `supabase` is then `null` and callers check `isSupabaseConfigured`.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);

export type TypedSupabaseClient = SupabaseClient<Database>;

export const supabase: TypedSupabaseClient | null = isSupabaseConfigured
  ? createClient<Database>(url!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** For code paths that cannot run without the database. */
export function requireSupabase(): TypedSupabaseClient {
  if (!supabase) {
    throw new Error("Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
  return supabase;
}
