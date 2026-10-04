/**
 * The terms acceptance given just before leaving for Google.
 *
 * On the registration page the visitor accepts the terms in a dialog, then
 * the browser leaves for Google and comes back signed in. Nothing can travel
 * through Google, so the acceptance waits in this browser for a short while
 * and is recorded (`consent_records`) once the new account is open. It is only
 * a note of what the visitor did a moment ago: the database holds the proof,
 * and the checkout refuses an account whose proof is missing.
 */

const KEY = "gt-google-terms";

/** Long enough for a slow Google sign-in, short enough not to outlive the errand. */
export const GOOGLE_TERMS_TTL_MS = 15 * 60 * 1000;

export const isFreshGoogleTerms = (at: number, now: number): boolean =>
  Number.isFinite(at) && now - at >= 0 && now - at <= GOOGLE_TERMS_TTL_MS;

export function rememberGoogleTerms(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, String(now));
  } catch {
    // Storage blocked: the account page asks for the acceptance instead.
  }
}

/** True once when the visitor accepted just before Google; the note is removed either way. */
export function takeGoogleTerms(now: number = Date.now()): boolean {
  try {
    const value = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    return value !== null && isFreshGoogleTerms(Number(value), now);
  } catch {
    return false;
  }
}
