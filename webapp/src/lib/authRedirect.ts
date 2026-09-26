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
