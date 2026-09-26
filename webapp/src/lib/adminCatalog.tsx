import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ADMIN_PRODUCTS,
  CATEGORIES,
  SEED_ACTIVITY,
  SEED_RECOMMENDATIONS,
  categoryById as fixtureCategory,
  type ActivityEntry,
  type ActivityKind,
  type AdminProduct,
  type ProductRecommendation,
  type ProductStatus,
  type RecommendationKind,
} from "../data/adminCatalog";
import type { Localized } from "../data/types";
import { isSupabaseConfigured } from "./supabase/client";
import { SupabaseAdminCatalogProvider } from "./adminCatalogSupabase";
import {
  ACTIVITY_LIMIT,
  AdminCatalogContext,
  STATUS_NOTE,
  computeStats,
  type AdminCatalogValue,
} from "./adminCatalogContext";

export { useAdminCatalog, CatalogError, type AdminCatalogValue, type CatalogStats } from "./adminCatalogContext";

/**
 * The administration catalogue store.
 *
 * With `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set, products,
 * stock, media and recommendations are read from and written to Supabase
 * (`adminCatalogSupabase.tsx`). Without them the prototype keeps running on
 * the in-memory fixtures below, so a preview deployment without a database
 * still shows a working back office.
 */
export function AdminCatalogProvider({ children, actor = "Camille D." }: { children: ReactNode; actor?: string }) {
  return isSupabaseConfigured ? (
    <SupabaseAdminCatalogProvider actor={actor}>{children}</SupabaseAdminCatalogProvider>
  ) : (
    <MockAdminCatalogProvider actor={actor}>{children}</MockAdminCatalogProvider>
  );
}

/** How long a simulated write takes, so save buttons have a real busy state. */
const SAVE_DELAY_MS = 700;

/** Initial list fetch, so the table can show its skeleton at least once. */
const LOAD_DELAY_MS = 550;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let activitySeq = 0;
function entry(
  kind: ActivityKind,
  product: AdminProduct,
  actor: string,
  detail?: Localized,
): ActivityEntry {
  return {
    id: `act-live-${++activitySeq}`,
    kind,
    productId: product.id,
    productName: product.name,
    detail,
    at: new Date().toISOString(),
    actor,
  };
}

/**
 * Prototype store: everything lives in React state, a refresh restores the
 * seeded catalogue, and nothing leaves the browser.
 */
function MockAdminCatalogProvider({ children, actor }: { children: ReactNode; actor: string }) {
  const [products, setProducts] = useState<AdminProduct[]>(ADMIN_PRODUCTS);
  const [activity, setActivity] = useState<ActivityEntry[]>(SEED_ACTIVITY);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>(SEED_RECOMMENDATIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), LOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const log = useCallback(
    (kind: ActivityKind, product: AdminProduct, detail?: Localized) => {
      setActivity((prev) => [entry(kind, product, actor, detail), ...prev].slice(0, ACTIVITY_LIMIT));
    },
    [actor],
  );

  const getProduct = useCallback((id: string) => products.find((p) => p.id === id), [products]);

  const createProduct = useCallback(
    async (product: AdminProduct) => {
      await wait(SAVE_DELAY_MS);
      const now = new Date().toISOString();
      const saved: AdminProduct = { ...product, createdAt: now, updatedAt: now };
      setProducts((prev) => [saved, ...prev]);
      log("created", saved, saved.status === "draft" ? { fr: "Enregistré en brouillon", en: "Saved as a draft" } : undefined);
      return saved;
    },
    [log],
  );

  const updateProduct = useCallback(
    async (id: string, patch: Partial<AdminProduct>, note?: Localized) => {
      await wait(SAVE_DELAY_MS);
      let saved: AdminProduct | undefined;
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          saved = { ...p, ...patch, updatedAt: new Date().toISOString() };
          return saved;
        }),
      );
      if (saved) log("updated", saved, note);
      return saved;
    },
    [log],
  );

  const setStatus = useCallback(
    async (id: string, status: ProductStatus) => {
      let saved: AdminProduct | undefined;
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          saved = { ...p, status, updatedAt: new Date().toISOString() };
          return saved;
        }),
      );
      if (saved) {
        const kind: ActivityKind = status === "archived" ? "archived" : "status";
        log(kind, saved, STATUS_NOTE[status]);
      }
    },
    [log],
  );

  const duplicateProduct = useCallback(
    async (id: string) => {
      await wait(SAVE_DELAY_MS);
      const source = products.find((p) => p.id === id);
      if (!source) return undefined;
      const now = new Date().toISOString();
      const copy: AdminProduct = {
        ...source,
        id: `${source.id}-copy-${Date.now().toString(36)}`,
        sku: `${source.sku}-COPY`,
        name: { fr: `${source.name.fr} (copie)`, en: `${source.name.en} (copy)` },
        // A duplicate is always a draft: shipping a copy live by accident is the
        // one mistake this action could otherwise make.
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };
      setProducts((prev) => [copy, ...prev]);
      log("duplicated", copy, { fr: `Copie de ${source.name.fr}`, en: `Copy of ${source.name.en}` });
      return copy;
    },
    [products, log],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      await wait(SAVE_DELAY_MS);
      const target = products.find((p) => p.id === id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      // Links go with the product, from either end (ON DELETE CASCADE).
      setRecommendations((prev) => prev.filter((r) => r.productId !== id && r.recommendedProductId !== id));
      if (target) log("deleted", target);
    },
    [products, log],
  );

  const recommendationsFor = useCallback(
    (productId: string, kind: RecommendationKind) =>
      recommendations
        .filter((r) => r.productId === productId && r.kind === kind)
        .sort((a, b) => a.position - b.position)
        .map((r) => r.recommendedProductId),
    [recommendations],
  );

  const saveRecommendations = useCallback(
    async (productId: string, lists: Record<RecommendationKind, string[]>) => {
      await wait(SAVE_DELAY_MS);
      // Same invariants as the table: no self link, one link per pair and kind.
      const rows = (Object.entries(lists) as [RecommendationKind, string[]][]).flatMap(([kind, ids]) =>
        [...new Set(ids)]
          .filter((id) => id !== productId)
          .map((recommendedProductId, position) => ({ productId, recommendedProductId, kind, position })),
      );
      setRecommendations((prev) => [...prev.filter((r) => r.productId !== productId), ...rows]);
      const product = products.find((p) => p.id === productId);
      if (product) log("updated", product, { fr: "Recommandations modifiées", en: "Recommendations updated" });
    },
    [products, log],
  );

  const blankProduct = useCallback<() => AdminProduct>(() => {
    const now = new Date().toISOString();
    return {
      id: `new-${Date.now().toString(36)}`,
      sku: "",
      name: { fr: "", en: "" },
      shortDescription: { fr: "", en: "" },
      description: { fr: "", en: "" },
      categoryId: "gems",
      type: "single",
      price: 0,
      media: [],
      trackInventory: true,
      stock: 0,
      lowStockThreshold: 10,
      availability: "in_stock",
      status: "draft",
      material: { fr: "", en: "" },
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
  }, []);

  const stats = useMemo(() => computeStats(products), [products]);

  const value = useMemo<AdminCatalogValue>(
    () => ({
      source: "mock",
      products,
      activity,
      loading,
      loadError: null,
      reload: () => {},
      stats,
      categories: CATEGORIES,
      categoryById: fixtureCategory,
      getProduct,
      createProduct,
      updateProduct,
      setStatus,
      duplicateProduct,
      deleteProduct,
      blankProduct,
      uploadImage: null,
      recommendationsFor,
      saveRecommendations,
    }),
    [
      recommendationsFor,
      saveRecommendations,
      products,
      activity,
      loading,
      stats,
      getProduct,
      createProduct,
      updateProduct,
      setStatus,
      duplicateProduct,
      deleteProduct,
      blankProduct,
    ],
  );

  return <AdminCatalogContext.Provider value={value}>{children}</AdminCatalogContext.Provider>;
}
