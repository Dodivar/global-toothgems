import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { gateFor, signInRedirect } from "../../src/lib/authRoutes";
import { PATH_HEADER } from "../../src/lib/localeHeader";
import { isSupabaseConfigured } from "../../src/lib/supabase/env";
import { createServerSupabase } from "../../src/lib/supabase/server";
import { isActiveStaff, STAFF_PROFILE_COLUMNS, type StaffProfileRow } from "../../src/lib/staffProfile";

/*
 * Server-side turning away of signed-out visitors for the member space, the
 * learner pages and the back office (docs/migration-nextjs.md, phase 4) — the
 * same rule as the proxy (`gateFor`, `signInRedirect`), checked again where
 * the page is rendered. The back office answers the site's 404 to anyone who
 * is not an active staff member, signed in or not (decided by the user,
 * 2026-10-01; a 404 rather than a sign-in page since 2026-11-11), as
 * `RequireAdmin` does in the browser.
 * Navigation, not authorization: RLS decides every read and write. Mock mode
 * (no Supabase): nothing to check, the client guards decide, as before.
 */

/** The user of the request's session, or null: `getClaims()` validates the access token, the cookie alone is never trusted. Once per request. */
const sessionUser = cache(async (): Promise<string | null> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getClaims();
  const user = data?.claims?.sub;
  return !error && typeof user === "string" ? user : null;
});

/** Whether the session's account is an active staff member: its own profile, read under RLS. Once per request; any failure counts as no. */
const isStaffSession = cache(async (user: string): Promise<boolean> => {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("profiles").select(STAFF_PROFILE_COLUMNS).eq("id", user).maybeSingle();
  return !error && isActiveStaff(data as StaffProfileRow | null);
});

/**
 * Redirects (307) a signed-out visitor away from a member address to the
 * sign-in page, with `?suite=`; answers 404 on a back-office address to
 * anyone without an active staff role.
 */
export async function guardAddress(pathname: string, search: string) {
  if (!isSupabaseConfigured) return;
  const gate = gateFor(pathname);
  if (!gate) return;
  const user = await sessionUser();
  if (user && (gate !== "staff" || (await isStaffSession(user)))) return;
  if (gate === "staff") notFound();
  redirect(signInRedirect(pathname, search));
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
