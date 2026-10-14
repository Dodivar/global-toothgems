import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Configuration of the live suite: a LOCAL Supabase stack (`supabase start`,
 * every migration + seed.sql + seed_demo_member.sql). Read once, checked
 * strictly: a missing value or a non-local address stops the run before any
 * test, so the suite can never create users or orders on a real project.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The live E2E suite needs a local Supabase stack: from the repository root run ` +
        "`supabase start`, then export the values listed in webapp/.env.test.example (see docs/testing.md).",
    );
  }
  return value;
}

export function liveEnv() {
  const url = required("E2E_SUPABASE_URL");
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && !LOCAL_HOSTS.has(`[${host}]`)) {
    throw new Error(`E2E_SUPABASE_URL points at ${host}: the live suite only runs against a local Supabase stack.`);
  }
  return {
    url,
    publishableKey: required("E2E_SUPABASE_PUBLISHABLE_KEY"),
    /** The local stack's service key: creates the test accounts. Never a real project's (checked above). */
    serviceKey: required("E2E_SUPABASE_SERVICE_KEY"),
  };
}

/** Service-role client of the local stack, for setup and for checking persisted state. */
export function serviceClient(): SupabaseClient {
  const env = liveEnv();
  return createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A client signed in as one of the test accounts, to test RLS directly (not through the UI). */
export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const env = liveEnv();
  const client = createClient(env.url, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Cannot sign in as ${email}: ${error.message}`);
  return client;
}

export function anonClient(): SupabaseClient {
  const env = liveEnv();
  return createClient(env.url, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** The demo member of supabase/seed_demo_member.sql (fixed id, four orders built through create_order()). */
export const DEMO_MEMBER_ID = "c4a11e00-0000-4000-a000-000000000001";

/** Accounts the setup creates (example.com is reserved: nothing is ever delivered). */
export const ACCOUNTS = {
  customer: "e2e.customer@example.com",
  staff: "e2e.staff@example.com",
  demo: "camille.bernard@example.com",
} as const;

/** One password per run, made by the global setup and shared with the workers through the environment. */
export function testPassword(): string {
  return required("E2E_TEST_PASSWORD");
}
