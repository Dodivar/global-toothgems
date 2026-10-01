import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * A Supabase client for public server reads (catalogue pages, sitemap): the
 * publishable key and no session, so it reads exactly what an anonymous
 * visitor may read under RLS, whoever asks for the page. Never the service
 * role. Callers check `isSupabaseConfigured` first.
 */
export function createPublicServerSupabase() {
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
