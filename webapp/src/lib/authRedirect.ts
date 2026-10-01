import { authConfirmUrl, CONFIRM_ACCOUNT_PATH, isSafeNext, RETURN_PARAM } from "./authRoutes";

export { isSafeNext };

/**
 * Paths the authentication emails send members back to. Kept apart from
 * `auth.tsx` so that file only exports the provider, hook and guard.
 */

/**
 * Where the confirmation link sends a new member: through `/auth/confirm`,
 * which opens the session server-side, then on to the confirmation page with
 * the page they were heading to.
 */
export function confirmationRedirect(next?: string): string {
  const landing = new URL(CONFIRM_ACCOUNT_PATH, window.location.origin);
  if (next && isSafeNext(next)) landing.searchParams.set(RETURN_PARAM, next);
  return authConfirmUrl(landing.pathname + landing.search, window.location.origin);
}

export type AuthLinkError = "expired" | "invalid";

/**
 * Supabase reports a refused email link in the URL — in the fragment with the
 * implicit flow of links sent before the move to cookie sessions
 * (`#error=access_denied&error_code=otp_expired`), in the query string with
 * PKCE and when `/auth/confirm` turns a link down. Both are read, so a change of flow cannot
 * turn an expired link into a silent failure.
 */
export function authLinkErrorFromUrl(location: Pick<Location, "hash" | "search"> = window.location): AuthLinkError | null {
  for (const part of [location.hash.replace(/^#/, ""), location.search.replace(/^\?/, "")]) {
    const params = new URLSearchParams(part);
    const code = params.get("error_code");
    if (code || params.get("error")) return code === "otp_expired" ? "expired" : "invalid";
  }
  return null;
}
