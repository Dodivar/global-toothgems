import { createContext, useContext } from "react";
import {
  matchesStockState,
  type ActivityEntry,
  type AdminProduct,
  type Category,
  type ProductImage,
  type ProductStatus,
  type RecommendationKind,
} from "../data/adminCatalog";
import type { Localized } from "../data/types";
import type { CatalogErrorKind } from "./adminCatalogMapping";

/**
 * The contract every admin catalogue screen talks to.
 *
 * Two stores implement it: the in-memory prototype (`adminCatalog.tsx`) and
 * the Supabase-backed one (`adminCatalogSupabase.tsx`). Screens never know
 * which one they are on, except through `source` for the few places where the
 * workflow genuinely differs (real uploads, no promotional price field).
 */

export interface CatalogStats {
  total: number;
  active: number;
  draft: number;
  archived: number;
  outOfStock: number;
  lowStock: number;
}

export interface AdminCatalogValue {
  /** Where the catalogue lives: the prototype fixtures or the Supabase database. */
  source: "mock" | "supabase";
  products: AdminProduct[];
  activity: ActivityEntry[];
  /** True until the first load of the list has finished. */
  loading: boolean;
  /** Why the last load failed, or null. */
  loadError: CatalogErrorKind | null;
  reload: () => void;
  stats: CatalogStats;
  categories: Category[];
  /** Category of a product; a neutral placeholder for an unknown id. */
  categoryById: (id: string) => Category;
  getProduct: (id: string) => AdminProduct | undefined;
  /** Writes reject with a `CatalogError` (already reported to the user by a toast). */
  createProduct: (product: AdminProduct) => Promise<AdminProduct>;
  updateProduct: (id: string, patch: Partial<AdminProduct>, note?: Localized) => Promise<AdminProduct | undefined>;
  setStatus: (id: string, status: ProductStatus) => Promise<void>;
  duplicateProduct: (id: string) => Promise<AdminProduct | undefined>;
  deleteProduct: (id: string) => Promise<void>;
  /** Fresh product shell for the creation form. */
  blankProduct: () => AdminProduct;
  /**
   * Stores an image file for the product and returns the media entry to add to
   * the form. Null when the store cannot upload (the prototype).
   */
  uploadImage: ((productId: string, file: File) => Promise<ProductImage>) | null;
  /** Ids of the products recommended next to `productId`, in display order. */
  recommendationsFor: (productId: string, kind: RecommendationKind) => string[];
  /**
   * Replaces the product's ordered lists, both kinds in one write: the screen
   * edits lists, and the database keeps them as one row per link.
   */
  saveRecommendations: (productId: string, lists: Record<RecommendationKind, string[]>) => Promise<void>;
}

/** A failed catalogue write, classified for the message shown to the user. */
export class CatalogError extends Error {
  readonly kind: CatalogErrorKind;

  constructor(kind: CatalogErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "CatalogError";
    this.kind = kind;
  }
}

export const AdminCatalogContext = createContext<AdminCatalogValue | null>(null);

export function useAdminCatalog() {
  const ctx = useContext(AdminCatalogContext);
  if (!ctx) throw new Error("useAdminCatalog must be used within AdminCatalogProvider");
  return ctx;
}

export function computeStats(products: AdminProduct[]): CatalogStats {
  const live = products.filter((p) => p.status !== "archived");
  return {
    total: products.length,
    active: products.filter((p) => p.status === "active").length,
    draft: products.filter((p) => p.status === "draft").length,
    archived: products.filter((p) => p.status === "archived").length,
    // Same rule as the availability filter the dashboard cards link to.
    outOfStock: live.filter((p) => matchesStockState(p, "out_of_stock")).length,
    lowStock: live.filter((p) => matchesStockState(p, "low_stock")).length,
  };
}

/** Stand-in for a category id the list does not know (deleted, or not loaded yet). */
export function unknownCategory(id: string): Category {
  return { id, name: { fr: "—", en: "—" }, description: { fr: "", en: "" } };
}

/** Keeps the session activity feed from growing without bound. */
export const ACTIVITY_LIMIT = 24;

export const STATUS_NOTE: Record<ProductStatus, Localized> = {
  active: { fr: "Mis en ligne", en: "Published" },
  draft: { fr: "Repassé en brouillon", en: "Moved back to draft" },
  archived: { fr: "Archivé", en: "Archived" },
};
