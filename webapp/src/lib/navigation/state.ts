/*
 * What a navigation hands to the page it opens (decided by the user,
 * 2026-09-30, docs/migration-nextjs.md phase 5, option A): the page to return
 * to after signing in, the e-mail typed on the sign-in form, why the visitor
 * is registering. React Router kept it in the history entry; the Next.js
 * router has no such state, so it is kept for the tab (sessionStorage) with
 * the address it was given for:
 * - every navigation through `lib/navigation` writes it, or clears it when it
 *   carries none;
 * - the page at that exact address (path and query) reads it, also after a
 *   reload; any other address reads nothing.
 * The address never changes. Known limit: a later back/forward to an earlier
 * page does not bring back what that page was given.
 */
const STATE_KEY = "gt-nav-state";

interface Handoff {
  address: string;
  state: unknown;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Records what the navigation to `address` carries (nothing: clears it). */
export function handOff(address: string, state: unknown) {
  const store = storage();
  if (!store) return;
  try {
    if (state === undefined || state === null) store.removeItem(STATE_KEY);
    else store.setItem(STATE_KEY, JSON.stringify({ address, state } satisfies Handoff));
  } catch {
    // Storage blocked or full: the page opens without it, as a direct visit would.
  }
}

/** What the navigation to `address` carried, or null. */
export function stateFor(address: string): unknown {
  try {
    const raw = storage()?.getItem(STATE_KEY);
    if (!raw) return null;
    const handoff = JSON.parse(raw) as Partial<Handoff>;
    return handoff.address === address ? (handoff.state ?? null) : null;
  } catch {
    return null;
  }
}
