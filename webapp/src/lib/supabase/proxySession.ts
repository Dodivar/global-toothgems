import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

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
 */
export async function refreshSession(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<{ response: NextResponse; signedIn: boolean }> {
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  let response = next();
  if (!hasAuthCookie(request)) return { response, signedIn: false };

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
  return { response, signedIn: !error && Boolean(data?.claims) };
}
