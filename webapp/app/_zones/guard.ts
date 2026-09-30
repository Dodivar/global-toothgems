import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { gateFor, signInRedirect } from "../../src/lib/authRoutes";
import { PATH_HEADER } from "../../src/lib/localeHeader";
import { isSupabaseConfigured } from "../../src/lib/supabase/env";
import { createServerSupabase } from "../../src/lib/supabase/server";

/*
 * Server-side turning away of signed-out visitors for the member space, the
 * learner pages and the back office (docs/migration-nextjs.md, phase 4) — the
 * same rule as the proxy (`gateFor`, `signInRedirect`), checked again where
 * the page is rendered. Navigation, not authorization: RLS decides every read
 * and write, and the staff role is not checked here. Mock mode (no Supabase):
 * nothing to check, the client guards decide, as before.
 */

/** Whether the request carries a valid session: `getClaims()` validates the access token, the cookie alone is never trusted. Once per request. */
const hasSession = cache(async () => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getClaims();
  return !error && Boolean(data?.claims);
});

/** Redirects (307) a signed-out visitor away from a gated address to its sign-in page, with `?suite=`. */
export async function guardAddress(pathname: string, search: string) {
  if (!isSupabaseConfigured) return;
  const gate = gateFor(pathname);
  if (!gate || (await hasSession())) return;
  redirect(signInRedirect(gate, pathname, search));
}

/**
 * The same check for a layout, which is not given the address: the proxy
 * passes it in a request header. Without it (never expected), the check is
 * made on `fallback`, the zone's own address.
 */
export async function guardRequest(fallback: string) {
  const asked = (await headers()).get(PATH_HEADER);
  const url = new URL(asked?.startsWith("/") ? asked : fallback, "http://site.invalid");
  await guardAddress(url.pathname, url.search);
}
