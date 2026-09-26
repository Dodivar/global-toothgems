import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { PRODUCTS, getProduct, type Product } from "../../data/products";
import { isSupabaseConfigured } from "../supabase/client";
import { fetchCatalog } from "./api";

export type CatalogStatus = "loading" | "ready" | "error";

interface CatalogContextValue {
  status: CatalogStatus;
  /** Where the products come from: the database, or the prototype's fixtures when it is not configured. */
  source: "supabase" | "mock";
  products: Product[];
  error: Error | null;
  reload: () => void;
  /** By base slug or by any published localized slug. */
  findProduct: (idOrSlug: string) => Product | undefined;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

/**
 * Loads the storefront catalogue once per visit and shares it.
 *
 * The whole catalogue is small (tens of products) and every translation comes
 * with it, so switching language needs no refetch and every page — shop,
 * product, home, cart — reads the same data. When the catalogue grows past a
 * few hundred products this becomes paginated, filtered queries instead.
 *
 * A failed load is surfaced as `status: "error"` with a retry; it never falls
 * back to the mock catalogue, which would show customers products that do
 * not exist.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: CatalogStatus; products: Product[]; error: Error | null }>(() =>
    isSupabaseConfigured
      ? { status: "loading", products: [], error: null }
      : { status: "ready", products: PRODUCTS, error: null },
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const controller = new AbortController();
    fetchCatalog(controller.signal)
      .then((products) => setState({ status: "ready", products, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[catalog] load failed", error);
        setState({ status: "error", products: [], error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<CatalogContextValue>(
    () => ({
      ...state,
      source: isSupabaseConfigured ? "supabase" : "mock",
      reload,
      findProduct: (idOrSlug) => getProduct(idOrSlug, state.products),
    }),
    [state, reload],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
