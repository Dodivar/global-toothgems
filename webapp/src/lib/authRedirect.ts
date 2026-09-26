/**
 * Paths the authentication emails send members back to. Kept apart from
 * `auth.tsx` so that file only exports the provider, hook and guard.
 */

/** Where the confirmation link sends a new member, with the page they were heading to. */
export function confirmationRedirect(next?: string): string {
  const url = new URL("/confirmation-compte", window.location.origin);
  if (next && isSafeNext(next)) url.searchParams.set("suite", next);
  return url.toString();
}

/** Only same-site paths: never let a link send someone to another origin. */
export function isSafeNext(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}

export type AuthLinkError = "expired" | "invalid";

/**
 * Supabase reports a refused email link in the URL — in the fragment with the
 * implicit flow this client uses (`#error=access_denied&error_code=otp_expired`),
 * in the query string with PKCE. Both are read, so a change of flow cannot
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
