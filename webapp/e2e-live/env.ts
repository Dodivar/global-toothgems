import { createHmac } from "node:crypto";
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

/**
 * The current 6-digit code of a TOTP secret (RFC 6238: SHA-1, 30 s steps),
 * as an authenticator app would show it. The staff account's secret is
 * enrolled by the global setup (`E2E_STAFF_TOTP_SECRET`).
 */
export function totpCode(secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  const offset = hash[hash.length - 1] & 0xf;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export function staffTotpSecret(): string {
  return required("E2E_STAFF_TOTP_SECRET");
}

/**
 * The staff account signed in AND past its second factor (aal2): the
 * database refuses every staff right to a password-only session
 * (migration `staff_mfa_required`).
 */
export async function staffClient(email: string, password: string): Promise<SupabaseClient> {
  const client = await signedInClient(email, password);
  const { data, error } = await client.auth.mfa.listFactors();
  const factor = data?.totp.find((f) => f.status === "verified");
  if (error || !factor) throw new Error(`${email} has no verified second factor: run the global setup.`);
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totpCode(staffTotpSecret()) });
  if (verified.error) throw new Error(`Second factor refused for ${email}: ${verified.error.message}`);
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
