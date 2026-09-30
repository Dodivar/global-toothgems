import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * A Supabase client for route handlers and server components, acting as the
 * visitor: publishable key + the session from the request cookies, so RLS
 * applies exactly as in the browser. Never the service role.
 *
 * Callers check `isSupabaseConfigured` first.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a server component, which cannot write cookies: the
          // proxy refreshes the session on the next request instead.
        }
      },
    },
  });
}
