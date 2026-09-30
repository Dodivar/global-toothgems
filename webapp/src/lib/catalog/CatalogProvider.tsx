import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { FALLBACK_GEM_COLORS, PRODUCTS, type GemColorDef, type Product } from "../../data/products";
import { isSupabaseConfigured } from "../supabase/client";
import { FALLBACK_TAXONOMY, type ShopCategoryDef } from "../../data/taxonomy";
import { fetchCatalog, fetchGemColors, fetchTaxonomy } from "./api";
import { findProductByKey, productSlugTranslator } from "./productSlugs";
import type { ParamTranslator } from "../localeRoutes";

export type CatalogStatus = "loading" | "ready" | "error";

interface CatalogContextValue {
  status: CatalogStatus;
  /** Where the products come from: the database, or the prototype's fixtures when it is not configured. */
  source: "supabase" | "mock";
  products: Product[];
  /** The colour filter's entries, in the order set in the back office. */
  colors: GemColorDef[];
  /** Categories and their families, in the order set in the back office. */
  taxonomy: ShopCategoryDef[];
  error: Error | null;
  reload: () => void;
  /** By base slug, by any published localized slug or by row id. */
  findProduct: (idOrSlug: string) => Product | undefined;
  /**
   * Product slugs of each language for links (`lib/navigation`), from the
   * products this provider holds: the server's seed on the server and on the
   * first browser render alike, so both write the same `href`.
   */
  translateSlugs: ParamTranslator;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

/**
 * What the server read of the catalogue for a page it renders (phase 3.2 of
 * docs/migration-nextjs.md), so the page's content is in its HTML and the
 * browser starts from the same data. Any part left out is loaded by the
 * browser, as before. Unused in mock mode (the fixtures are in the bundle).
 */
export interface CatalogSeed {
  products?: Product[];
  colors?: GemColorDef[];
  taxonomy?: ShopCategoryDef[];
}

/**
 * Loads the storefront catalogue once per visit and shares it (starting from
 * what the server read, on a server-rendered page: `seed`).
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
export function CatalogProvider({ seed, children }: { seed?: CatalogSeed; children: ReactNode }) {
  const [state, setState] = useState<{ status: CatalogStatus; products: Product[]; error: Error | null }>(() => {
    if (!isSupabaseConfigured) {
      return { status: "ready", products: PRODUCTS, error: null };
    }
    if (seed?.products) {
      return { status: "ready", products: seed.products, error: null };
    }
    return { status: "loading", products: [], error: null };
  });
  const [colors, setColors] = useState<GemColorDef[]>(() => (isSupabaseConfigured ? (seed?.colors ?? []) : FALLBACK_GEM_COLORS));
  const [taxonomy, setTaxonomy] = useState<ShopCategoryDef[]>(() => (isSupabaseConfigured ? (seed?.taxonomy ?? []) : FALLBACK_TAXONOMY));
  const [attempt, setAttempt] = useState(0);
  // What the server already read for this page is not asked for again; a
  // retry (`reload`) asks for everything.
  const [seeded] = useState(() => ({ products: Boolean(seed?.products), colors: Boolean(seed?.colors), taxonomy: Boolean(seed?.taxonomy) }));

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const first = attempt === 0;
    const controller = new AbortController();
    // Colours only feed the filters: failing to load them hides the colour
    // chips, it must not take the shop down.
    if (!(first && seeded.colors)) {
      fetchGemColors(controller.signal)
        .then(setColors)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) console.warn("[catalog] gem colours unavailable", error);
        });
    }
    // Same for the taxonomy: without it the menu and the type filter are
    // empty, but products still list and sell.
    if (!(first && seeded.taxonomy)) {
      fetchTaxonomy(controller.signal)
        .then(setTaxonomy)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) console.warn("[catalog] taxonomy unavailable", error);
        });
    }
    if (!(first && seeded.products)) {
      fetchCatalog(controller.signal)
        .then((products) => {
          setState({ status: "ready", products, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error("[catalog] load failed", error);
          setState({ status: "error", products: [], error: error instanceof Error ? error : new Error(String(error)) });
        });
    }
    return () => controller.abort();
  }, [attempt, seeded]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    setAttempt((n) => n + 1);
  }, []);

  const translateSlugs = useMemo(() => productSlugTranslator(state.products), [state.products]);

  const value = useMemo<CatalogContextValue>(
    () => ({
      ...state,
      colors,
      taxonomy,
      source: isSupabaseConfigured ? "supabase" : "mock",
      reload,
      findProduct: (idOrSlug) => findProductByKey(state.products, idOrSlug),
      translateSlugs,
    }),
    [state, colors, taxonomy, reload, translateSlugs],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

const keepSlugs: ParamTranslator = (_id, params) => params;

/** The catalogue's slug translator, or none outside a `CatalogProvider`. */
export function useSlugTranslator(): ParamTranslator {
  return useContext(CatalogContext)?.translateSlugs ?? keepSlugs;
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
