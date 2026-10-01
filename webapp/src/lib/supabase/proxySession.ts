import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";
import { isActiveStaff, STAFF_PROFILE_COLUMNS, type StaffProfileRow } from "../staffProfile";

/** `sb-<ref>-auth-token`, possibly split into `.0`, `.1`… chunks. */
const hasAuthCookie = (request: NextRequest) =>
  request.cookies.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token") && !name.endsWith("-code-verifier"));

/**
 * Refreshes the visitor's Supabase session for this request (Supabase's
 * Next.js proxy pattern): an expired access token is renewed and the new
 * cookies go both to the rest of the request and back to the browser.
 *
 * `signedIn` comes from `getClaims()`, which validates the access token
 * (locally against the project's signing keys, or with Auth when the project
 * still uses a shared secret) — the cookie alone is never trusted. Without an
 * auth cookie there is nothing to check and Supabase is not called.
 *
 * `checkStaff` (back-office pages): also reads the account's own profile
 * (RLS) to tell whether it is an active staff member (`staffProfile.ts`);
 * `staff` is false when it is not, or when the profile cannot be read.
 */
export async function refreshSession(
  request: NextRequest,
  requestHeaders: Headers,
  { checkStaff = false }: { checkStaff?: boolean } = {},
): Promise<{ response: NextResponse; signedIn: boolean; staff: boolean }> {
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  let response = next();
  if (!hasAuthCookie(request)) return { response, signedIn: false, staff: false };

  const supabase = createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        // The refreshed cookies travel to the page through the request headers too.
        requestHeaders.set("cookie", request.cookies.toString());
        response = next();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Nothing between creating the client and this call (Supabase's guidance):
  // it is what refreshes the session.
  const { data, error } = await supabase.auth.getClaims();
  const user = !error ? data?.claims?.sub : undefined;
  if (typeof user !== "string") return { response, signedIn: false, staff: false };
  if (!checkStaff) return { response, signedIn: true, staff: false };
  const profile = await supabase.from("profiles").select(STAFF_PROFILE_COLUMNS).eq("id", user).maybeSingle();
  return { response, signedIn: true, staff: !profile.error && isActiveStaff(profile.data as StaffProfileRow | null) };
}
