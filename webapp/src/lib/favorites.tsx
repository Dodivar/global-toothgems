import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "./navigation";
import type { Product } from "../data/products";
import { pick } from "../data/types";
import { FavoriteAccountDialog } from "../components/favorites/FavoriteAccountDialog";
import { useAuth } from "./auth";
import { useCatalog } from "./catalog/CatalogProvider";
import { supabase } from "./supabase/client";
import { useToast } from "./toast";
import {
  browserStore,
  clearPendingFavorite,
  favoriteKey,
  rememberPendingFavorite,
  takePendingFavorite,
} from "./favoritesState";

/**
 * The signed-in member's favourite products (wishlist).
 *
 * With Supabase configured the list lives in `wishlist_items`, one row per
 * product, and every read and write is limited to the member's own rows by
 * Row Level Security — this file only decides what to show. Hearts react at
 * once and roll back if the database refuses.
 *
 * Without Supabase (the prototype's mock) the list is kept in memory for the
 * session and forgotten on sign-out, like the rest of the mock account.
 *
 * Favourites need an account. A visitor who taps a heart gets a dialog that
 * says so, with the way to create one or sign in; the product is remembered
 * and added as soon as a session opens (`favoritesState.ts`).
 */

export type FavoritesStatus = "idle" | "loading" | "ready" | "error";

interface FavoritesContextValue {
  /** `idle` while signed out; `error` when the list could not be read. */
  status: FavoritesStatus;
  isFavorite: (product: Product) => boolean;
  /** Adds or removes; signed out, opens the account dialog instead. */
  toggleFavorite: (product: Product) => void;
  /** Favourites still in the shop, in catalogue order. Archived products drop out. */
  favoriteProducts: Product[];
  /** Opens the account dialog, for entry points that are not one product (the shop's favourites view). */
  requestAccount: () => void;
  /** Reads the list again after an error. */
  reload: () => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

interface FavoritesList {
  /** Email of the account the list belongs to; null while nobody is signed in. */
  owner: string | null;
  status: FavoritesStatus;
  /** `favoriteKey` of each favourite product. */
  keys: ReadonlySet<string>;
}

const NO_KEYS: ReadonlySet<string> = new Set();

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { signedIn, email } = useAuth();
  const { products, source, status: catalogStatus, findProduct } = useCatalog();
  const { showToast } = useToast();
  const location = useLocation();

  // The list is tagged with the account it belongs to, so signing out or
  // switching accounts shows nothing stale before the new list arrives.
  const owner = signedIn ? email ?? "" : null;
  const [list, setList] = useState<FavoritesList>({ owner: null, status: "idle", keys: NO_KEYS });
  const [attempt, setAttempt] = useState(0);
  const [dialog, setDialog] = useState<{ open: boolean; productName?: string }>({ open: false });
  // A second tap while the first write is on its way would race it.
  const inflight = useRef(new Set<string>());

  const current = owner !== null && list.owner === owner ? list : null;
  // The mock keeps nothing between sessions: its list starts empty and ready.
  const status: FavoritesStatus = owner === null ? "idle" : current?.status ?? (supabase ? "loading" : "ready");
  const keys = current?.keys ?? NO_KEYS;

  // Load the member's list on sign-in, on a change of account and on retry.
  useEffect(() => {
    if (owner === null || !supabase) return;
    let active = true;
    void supabase
      .from("wishlist_items")
      .select("product_id")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn("[favorites] load failed", error.message);
          setList({ owner, status: "error", keys: NO_KEYS });
          return;
        }
        setList({ owner, status: "ready", keys: new Set(data.map((row) => row.product_id)) });
      });
    return () => {
      active = false;
    };
  }, [owner, attempt]);

  const setKey = useCallback(
    (key: string, on: boolean) => {
      setList((prev) => {
        const base: FavoritesList = prev.owner === owner ? prev : { owner, status: "ready", keys: NO_KEYS };
        if (base.keys.has(key) === on) return base;
        const next = new Set(base.keys);
        if (on) next.add(key);
        else next.delete(key);
        return { ...base, keys: next };
      });
    },
    [owner],
  );

  const isFavorite = useCallback(
    (product: Product) => {
      const key = favoriteKey(product, source);
      return key !== null && keys.has(key);
    },
    [keys, source],
  );

  /** Writes one change: optimistic, rolled back with a message if refused. */
  const write = useCallback(
    async (product: Product, on: boolean) => {
      const key = favoriteKey(product, source);
      const name = pick(product.name, i18n.language);
      if (key === null) {
        showToast(t("favorites.toastErrorTitle"), t("favorites.toastErrorBody"), "error");
        return;
      }
      if (inflight.current.has(key)) return;
      setKey(key, on);

      if (supabase) {
        inflight.current.add(key);
        const { error } = on
          ? await supabase.from("wishlist_items").insert({ product_id: key })
          : await supabase.from("wishlist_items").delete().eq("product_id", key);
        inflight.current.delete(key);
        // Already there (added from another tab): the goal is reached.
        if (error && !(on && error.code === "23505")) {
          console.warn("[favorites] write failed", error.message);
          setKey(key, !on);
          showToast(t("favorites.toastErrorTitle"), t("favorites.toastErrorBody"), "error");
          return;
        }
      }

      if (on) showToast(t("favorites.toastAddedTitle"), t("favorites.toastAddedBody", { name }));
      else showToast(t("favorites.toastRemovedTitle"), t("favorites.toastRemovedBody", { name }), "info");
    },
    [source, i18n.language, setKey, showToast, t],
  );

  const toggleFavorite = useCallback(
    (product: Product) => {
      if (!signedIn) {
        rememberPendingFavorite(browserStore(), product.id, Date.now());
        setDialog({ open: true, productName: pick(product.name, i18n.language) });
        return;
      }
      void write(product, !isFavorite(product));
    },
    [signedIn, write, isFavorite, i18n.language],
  );

  // The heart tapped before signing in, added once the list and the catalogue are known.
  useEffect(() => {
    if (!signedIn || status !== "ready" || catalogStatus !== "ready") return;
    const slug = takePendingFavorite(browserStore(), Date.now());
    const product = slug ? findProduct(slug) : undefined;
    if (product && !isFavorite(product)) void write(product, true);
  }, [signedIn, status, catalogStatus, findProduct, isFavorite, write]);

  const favoriteProducts = useMemo(() => products.filter(isFavorite), [products, isFavorite]);
  const requestAccount = useCallback(() => setDialog({ open: true }), []);
  const reload = useCallback(() => {
    setList((prev) => ({ ...prev, status: "loading" }));
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<FavoritesContextValue>(
    () => ({ status, isFavorite, toggleFavorite, favoriteProducts, requestAccount, reload }),
    [status, isFavorite, toggleFavorite, favoriteProducts, requestAccount, reload],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      <FavoriteAccountDialog
        open={dialog.open}
        productName={dialog.productName}
        returnTo={location.pathname + location.search}
        onContinue={() => setDialog({ open: false })}
        onDismiss={() => {
          clearPendingFavorite(browserStore());
          setDialog({ open: false });
        }}
      />
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
