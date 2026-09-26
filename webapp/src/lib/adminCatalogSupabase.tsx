import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  ActivityEntry,
  ActivityKind,
  AdminProduct,
  Category,
  ProductImage,
  ProductRecommendation,
  ProductStatus,
  RecommendationKind,
} from "../data/adminCatalog";
import type { Localized } from "../data/types";
import { useToast } from "./toast";
import { requireSupabase } from "./supabase/client";
import {
  ADMIN_CATEGORY_SELECT,
  ADMIN_PRODUCT_SELECT,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_MEDIA_BUCKET,
  UNSAVED_MEDIA_PREFIX,
  catalogErrorKind,
  productToPayload,
  rowToCategory,
  rowToProduct,
  rowToRecommendation,
  type CatalogErrorKind,
  type CategoryRow,
  type ProductRow,
  type RecommendationRow,
} from "./adminCatalogMapping";
import {
  ACTIVITY_LIMIT,
  AdminCatalogContext,
  CatalogError,
  STATUS_NOTE,
  computeStats,
  unknownCategory,
  type AdminCatalogValue,
} from "./adminCatalogContext";

/**
 * Admin catalogue backed by Supabase.
 *
 * Reads go straight to the tables (RLS lets staff read every product, draft
 * and archived included). Writes go through three SECURITY INVOKER functions
 * (migration `…_admin_product_management`) so a product, its English
 * translation, its stock and its media are saved in one transaction; RLS and
 * the `manage_products` permission decide whether the caller may write at all.
 *
 * Images are uploaded to the public `product-media` bucket as soon as they are
 * picked, under `products/<product id>/`, and linked to the product when the
 * form is saved. The browser only ever holds the publishable key.
 *
 * The activity feed is this session's own actions; the authoritative history
 * is `audit_logs` / `inventory_movements` in the database.
 */

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** SKU column rule: `^[A-Z0-9][A-Z0-9-]{1,63}$`. */
const SKU_MAX = 64;

let activitySeq = 0;

export function SupabaseAdminCatalogProvider({ children, actor }: { children: ReactNode; actor: string }) {
  const client = requireSupabase();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<CatalogErrorKind | null>(null);
  const [loadCount, setLoadCount] = useState(0);

  // Callbacks read the latest list without being rebuilt on every change.
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const publicUrl = useCallback(
    (path: string) => client.storage.from(PRODUCT_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [productRes, categoryRes, recommendationRes] = await Promise.all([
        client.from("products").select(ADMIN_PRODUCT_SELECT).order("updated_at", { ascending: false }),
        client.from("categories").select(ADMIN_CATEGORY_SELECT).order("position"),
        client.from("product_recommendations").select("product_id, recommended_product_id, kind, position"),
      ]);
      if (cancelled) return;
      const error = productRes.error ?? categoryRes.error ?? recommendationRes.error;
      if (error) {
        console.error("Admin catalogue load failed", error);
        setLoadError(catalogErrorKind(error));
      } else {
        setProducts((productRes.data as unknown as ProductRow[]).map((row) => rowToProduct(row, publicUrl)));
        setCategories((categoryRes.data as unknown as CategoryRow[]).map(rowToCategory));
        setRecommendations((recommendationRes.data as RecommendationRow[]).map(rowToRecommendation));
        setLoadError(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client, publicUrl, loadCount]);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadCount((n) => n + 1);
  }, []);

  /** Reports a failed write once, here, and hands the page a typed error. */
  const fail = useCallback(
    (error: { code?: string; message?: string; status?: number | string } | null | undefined): never => {
      console.error("Admin catalogue write failed", error);
      const kind = catalogErrorKind(error);
      showToast(t("admin.errors.title"), t(`admin.errors.${kind}`), "error");
      throw new CatalogError(kind, error?.message);
    },
    [showToast, t],
  );

  const log = useCallback(
    (kind: ActivityKind, product: AdminProduct, detail?: Localized) => {
      const item: ActivityEntry = {
        id: `act-db-${++activitySeq}`,
        kind,
        productId: product.id,
        productName: product.name,
        detail,
        at: new Date().toISOString(),
        actor,
      };
      setActivity((prev) => [item, ...prev].slice(0, ACTIVITY_LIMIT));
    },
    [actor],
  );

  /** Deleting a file nobody references is housekeeping: a failure is logged, not shown. */
  const removeFiles = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      const { error } = await client.storage.from(PRODUCT_MEDIA_BUCKET).remove(paths);
      if (error) console.warn("Could not remove unused product images", paths, error);
    },
    [client],
  );

  /** One write path for create, edit, status changes and duplicates. */
  const save = useCallback(
    async (product: AdminProduct): Promise<AdminProduct> => {
      let payload;
      try {
        payload = productToPayload(product);
      } catch (error) {
        return fail({ code: "22023", message: String(error) });
      }
      const { data, error } = await client.rpc("admin_save_product", { p_product: payload });
      if (error) return fail(error);

      const result = data as { id: string; removed_paths?: string[] };
      await removeFiles(result.removed_paths ?? []);

      const fresh = await client.from("products").select(ADMIN_PRODUCT_SELECT).eq("id", result.id).single();
      if (fresh.error) return fail(fresh.error);
      const saved = rowToProduct(fresh.data as unknown as ProductRow, publicUrl);
      setProducts((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
      return saved;
    },
    [client, fail, publicUrl, removeFiles],
  );

  const getProduct = useCallback((id: string) => products.find((p) => p.id === id), [products]);

  const createProduct = useCallback(
    async (product: AdminProduct) => {
      const saved = await save(product);
      log("created", saved, saved.status === "draft" ? { fr: "Enregistré en brouillon", en: "Saved as a draft" } : undefined);
      return saved;
    },
    [save, log],
  );

  const updateProduct = useCallback(
    async (id: string, patch: Partial<AdminProduct>, note?: Localized) => {
      const current = productsRef.current.find((p) => p.id === id);
      if (!current) return undefined;
      const saved = await save({ ...current, ...patch, id });
      log("updated", saved, note);
      return saved;
    },
    [save, log],
  );

  const setStatus = useCallback(
    async (id: string, status: ProductStatus) => {
      const current = productsRef.current.find((p) => p.id === id);
      if (!current) return;
      const saved = await save({ ...current, status });
      log(status === "archived" ? "archived" : "status", saved, STATUS_NOTE[status]);
    },
    [save, log],
  );

  const duplicateProduct = useCallback(
    async (id: string) => {
      const source = productsRef.current.find((p) => p.id === id);
      if (!source) return undefined;
      const taken = new Set(productsRef.current.map((p) => p.sku.toUpperCase()));
      const base = `${source.sku}-COPY`.slice(0, SKU_MAX - 3);
      let sku = base;
      for (let n = 2; taken.has(sku); n++) sku = `${base}${n}`;

      const copy: AdminProduct = {
        ...source,
        id: crypto.randomUUID(),
        sku,
        name: { fr: `${source.name.fr} (copie)`, en: source.name.en ? `${source.name.en} (copy)` : "" },
        // A duplicate is always a draft: shipping a copy live by accident is the
        // one mistake this action could otherwise make.
        status: "draft",
        // Same files, new rows: the copy gets its own media records that point
        // at the original's objects. A file is only deleted once no product
        // references it any more.
        media: source.media.map((image, index) => ({ ...image, id: `${UNSAVED_MEDIA_PREFIX}${index}` })),
      };
      const saved = await save(copy);
      log("duplicated", saved, { fr: `Copie de ${source.name.fr}`, en: `Copy of ${source.name.en || source.name.fr}` });
      return saved;
    },
    [save, log],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const target = productsRef.current.find((p) => p.id === id);
      const { data, error } = await client.rpc("admin_delete_product", { p_product_id: id });
      if (error) fail(error);
      await removeFiles(data ?? []);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      // Links go with the product, from either end (ON DELETE CASCADE).
      setRecommendations((prev) => prev.filter((r) => r.productId !== id && r.recommendedProductId !== id));
      if (target) log("deleted", target);
    },
    [client, fail, removeFiles, log],
  );

  const uploadImage = useCallback(
    async (productId: string, file: File): Promise<ProductImage> => {
      const extension = EXTENSION[file.type];
      if (!extension || file.size > PRODUCT_IMAGE_MAX_BYTES) return fail({ code: "22023" });
      const key = crypto.randomUUID();
      const path = `products/${productId}/${key}.${extension}`;
      const { error } = await client.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) return fail(error);
      return { id: `${UNSAVED_MEDIA_PREFIX}${key}`, storagePath: path, src: publicUrl(path), alt: { fr: "", en: "" } };
    },
    [client, fail, publicUrl],
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
      const { error } = await client.rpc("admin_save_product_recommendations", {
        p_product_id: productId,
        p_complementary: lists.complementary,
        p_similar: lists.similar,
      });
      if (error) fail(error);
      // Mirror what the function stored: no self link, one link per pair and kind.
      const rows = (Object.entries(lists) as [RecommendationKind, string[]][]).flatMap(([kind, ids]) =>
        [...new Set(ids)]
          .filter((id) => id !== productId)
          .map((recommendedProductId, position) => ({ productId, recommendedProductId, kind, position })),
      );
      setRecommendations((prev) => [...prev.filter((r) => r.productId !== productId), ...rows]);
      const product = productsRef.current.find((p) => p.id === productId);
      if (product) log("updated", product, { fr: "Recommandations modifiées", en: "Recommendations updated" });
    },
    [client, fail, log],
  );

  const blankProduct = useCallback<() => AdminProduct>(() => {
    const now = new Date().toISOString();
    return {
      // Generated here so images can be uploaded under the product's folder
      // before its first save.
      id: crypto.randomUUID(),
      sku: "",
      name: { fr: "", en: "" },
      shortDescription: { fr: "", en: "" },
      description: { fr: "", en: "" },
      categoryId: categories[0]?.id ?? "",
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
  }, [categories]);

  const categoryById = useCallback(
    (id: string) => categories.find((c) => c.id === id) ?? unknownCategory(id),
    [categories],
  );

  const stats = useMemo(() => computeStats(products), [products]);

  const value = useMemo<AdminCatalogValue>(
    () => ({
      source: "supabase",
      products,
      activity,
      loading,
      loadError,
      reload,
      stats,
      categories,
      categoryById,
      getProduct,
      createProduct,
      updateProduct,
      setStatus,
      duplicateProduct,
      deleteProduct,
      blankProduct,
      uploadImage,
      recommendationsFor,
      saveRecommendations,
    }),
    [
      products,
      activity,
      loading,
      loadError,
      reload,
      stats,
      categories,
      categoryById,
      getProduct,
      createProduct,
      updateProduct,
      setStatus,
      duplicateProduct,
      deleteProduct,
      blankProduct,
      uploadImage,
      recommendationsFor,
      saveRecommendations,
    ],
  );

  return <AdminCatalogContext.Provider value={value}>{children}</AdminCatalogContext.Provider>;
}
