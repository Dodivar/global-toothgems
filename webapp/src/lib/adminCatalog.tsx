import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ADMIN_PRODUCTS,
  SEED_ACTIVITY,
  stockState,
  type ActivityEntry,
  type ActivityKind,
  type AdminProduct,
  type ProductStatus,
} from "../data/adminCatalog";
import type { Localized } from "../data/types";

/**
 * Frontend catalogue store for the administration prototype.
 *
 * Everything lives in React state: a refresh restores the seeded catalogue, and
 * nothing leaves the browser. The point of routing every mutation through this
 * one module is that the screens above it already look like screens talking to
 * a backend — replacing the bodies of these callbacks with server calls is the
 * whole migration.
 */

/** How long a simulated write takes, so save buttons have a real busy state. */
export const SAVE_DELAY_MS = 700;

/** Initial list fetch, so the table can show its skeleton at least once. */
const LOAD_DELAY_MS = 550;

export interface CatalogStats {
  total: number;
  active: number;
  draft: number;
  archived: number;
  outOfStock: number;
  lowStock: number;
}

interface AdminCatalogValue {
  products: AdminProduct[];
  activity: ActivityEntry[];
  /** True during the simulated first load of the list. */
  loading: boolean;
  stats: CatalogStats;
  getProduct: (id: string) => AdminProduct | undefined;
  createProduct: (product: AdminProduct) => Promise<AdminProduct>;
  updateProduct: (id: string, patch: Partial<AdminProduct>, note?: Localized) => Promise<AdminProduct | undefined>;
  setStatus: (id: string, status: ProductStatus) => Promise<void>;
  duplicateProduct: (id: string) => Promise<AdminProduct | undefined>;
  deleteProduct: (id: string) => Promise<void>;
  /** Fresh product shell for the creation form. */
  blankProduct: () => AdminProduct;
}

const AdminCatalogContext = createContext<AdminCatalogValue | null>(null);

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

/** Keeps the feed from growing without bound during a long demo session. */
const ACTIVITY_LIMIT = 24;

const STATUS_NOTE: Record<ProductStatus, Localized> = {
  active: { fr: "Mis en ligne", en: "Published" },
  draft: { fr: "Repassé en brouillon", en: "Moved back to draft" },
  archived: { fr: "Archivé", en: "Archived" },
};

export function AdminCatalogProvider({ children, actor = "Camille D." }: { children: ReactNode; actor?: string }) {
  const [products, setProducts] = useState<AdminProduct[]>(ADMIN_PRODUCTS);
  const [activity, setActivity] = useState<ActivityEntry[]>(SEED_ACTIVITY);
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
      if (target) log("deleted", target);
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

  const stats = useMemo<CatalogStats>(() => {
    const live = products.filter((p) => p.status !== "archived");
    return {
      total: products.length,
      active: products.filter((p) => p.status === "active").length,
      draft: products.filter((p) => p.status === "draft").length,
      archived: products.filter((p) => p.status === "archived").length,
      outOfStock: live.filter((p) => stockState(p) === "out_of_stock").length,
      lowStock: live.filter((p) => stockState(p) === "low_stock").length,
    };
  }, [products]);

  const value = useMemo<AdminCatalogValue>(
    () => ({
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
    }),
    [
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

export function useAdminCatalog() {
  const ctx = useContext(AdminCatalogContext);
  if (!ctx) throw new Error("useAdminCatalog must be used within AdminCatalogProvider");
  return ctx;
}
