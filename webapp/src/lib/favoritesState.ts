/**
 * The parts of the wishlist that need no React: the shop URL of the
 * "My favourites" view, and the favourite a visitor asked for before having
 * an account.
 *
 * Kept apart from `favorites.tsx` so that file only exports the provider and
 * its hook, and so these rules can be tested without a browser.
 */

/** Shop query parameter that narrows the collection to the member's favourites. */
export const FAVORITES_PARAM = "favoris";

/** The shop, showing only the member's favourites: the header's heart links here. */
export const FAVORITES_HREF = `/boutique?${FAVORITES_PARAM}=1`;

export function isFavoritesView(params: URLSearchParams): boolean {
  return params.get(FAVORITES_PARAM) === "1";
}

/** `params` with the favourites view switched on or off; the other filters are kept. */
export function withFavoritesView(params: URLSearchParams, on: boolean): URLSearchParams {
  const next = new URLSearchParams(params);
  if (on) next.set(FAVORITES_PARAM, "1");
  else next.delete(FAVORITES_PARAM);
  next.delete("page");
  return next;
}

/**
 * What identifies a product in the wishlist: its database row id when the
 * catalogue comes from Supabase (that is what `wishlist_items` stores, and it
 * survives a slug change), its slug for the prototype's mock products. Null
 * when a database product somehow has no id: it then cannot be saved.
 */
export function favoriteKey(product: { id: string; dbId?: string }, source: "supabase" | "mock"): string | null {
  return source === "supabase" ? product.dbId ?? null : product.id;
}

/* ------------------------------------------------------------------ */
/* Favourite asked for while signed out                               */
/* ------------------------------------------------------------------ */

/**
 * A visitor who taps a heart is asked to sign in or create an account. The
 * product they tapped is remembered here and added as soon as a session
 * opens, so the tap is not lost on the way — including when the session opens
 * in another tab, from the confirmation email's link.
 *
 * Local storage rather than session storage for that last case. The intent is
 * only a product slug (no personal data) and expires, so a shared computer
 * does not hand yesterday's tap to the next person who signs in.
 */
const PENDING_KEY = "gt.pendingFavorite";

/** Long enough to fill in the registration form and open the confirmation email. */
export const PENDING_FAVORITE_TTL_MS = 60 * 60 * 1000;

/** The subset of `Storage` used here, so tests can pass a plain object. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface PendingFavorite {
  productId: string;
  at: number;
}

/** Remembers the product; storage that refuses (private mode, quota) only loses the convenience. */
export function rememberPendingFavorite(store: KeyValueStore | null, productId: string, now: number): void {
  try {
    store?.setItem(PENDING_KEY, JSON.stringify({ productId, at: now } satisfies PendingFavorite));
  } catch {
    // Nothing to do: the visitor can tap the heart again after signing in.
  }
}

/**
 * The product slug remembered within the time limit, or null. Always clears
 * what it read, so an intent is applied at most once.
 */
export function takePendingFavorite(store: KeyValueStore | null, now: number): string | null {
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_KEY);
    if (raw == null) return null;
    store.removeItem(PENDING_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as PendingFavorite).productId !== "string" ||
      typeof (parsed as PendingFavorite).at !== "number"
    ) {
      return null;
    }
    const { productId, at } = parsed as PendingFavorite;
    const age = now - at;
    return age >= 0 && age <= PENDING_FAVORITE_TTL_MS && productId ? productId : null;
  } catch {
    return null;
  }
}

/** Forgets the intent: the visitor dismissed the dialog rather than going on to an account. */
export function clearPendingFavorite(store: KeyValueStore | null): void {
  try {
    store?.removeItem(PENDING_KEY);
  } catch {
    // Unreadable storage holds nothing to clear.
  }
}

/** `window.localStorage`, or null where reading it throws (blocked site data). */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
