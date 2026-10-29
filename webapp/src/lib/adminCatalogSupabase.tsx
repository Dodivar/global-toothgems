import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  ActivityEntry,
  ActivityKind,
  AdminGemColor,
  AdminProduct,
  BundleComponent,
  Category,
  GemColorDraft,
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
  ADMIN_CATEGORY_SELECT_BASE,
  ADMIN_GEM_COLOR_SELECT,
  ADMIN_PRODUCT_SELECT,
  ADMIN_PRODUCT_SELECT_BASE,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_MEDIA_BUCKET,
  UNSAVED_MEDIA_PREFIX,
  catalogErrorKind,
  gemColorToPayload,
  productToPayload,
  rowToCategory,
  rowToGemColor,
  rowToProduct,
  rowToRecommendation,
  type CatalogErrorKind,
  type CategoryRow,
  type GemColorRow,
  type ProductRow,
  type RecommendationRow,
} from "./adminCatalogMapping";
import {
  ACTIVITY_LIMIT,
  AdminCatalogContext,
  CatalogError,
  STATUS_NOTE,
  STOCK_NOTE,
  computeStats,
  unknownCategory,
  type AdminCatalogValue,
} from "./adminCatalogContext";
import { BUNDLE_SELECT, bundlePayload, isBundle, kitsContaining, rowsToBundles, sameBundle, type BundleRow } from "./productBundles";

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
 * Kit compositions (decision 117) are read from `product_bundle_items` and
 * saved by `admin_save_product_bundle()` right after the product: the kit's
 * stock is then the database's, so the form never sends its count.
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
  const [gemColors, setGemColors] = useState<AdminGemColor[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<CatalogErrorKind | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  // False on a database without `…_category_families`: products read and
  // save without a family until the migration is applied.
  const familiesSupported = useRef(true);
  // False on a database without `…_product_bundles` (no kit can be saved).
  const bundlesSupported = useRef(true);

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
      const loadProducts = (select: string) =>
        client.from("products").select(select).order("updated_at", { ascending: false });
      const loadCategories = (select: string) => client.from("categories").select(select).order("position");
      let [productRes, categoryRes] = await Promise.all([loadProducts(ADMIN_PRODUCT_SELECT), loadCategories(ADMIN_CATEGORY_SELECT)]);
      // Any failure is retried once without the families (see
      // `ADMIN_PRODUCT_SELECT_BASE`); a real outage still fails the second time.
      if (productRes.error || categoryRes.error) {
        console.warn("Admin catalogue: product families unavailable", productRes.error ?? categoryRes.error);
        [productRes, categoryRes] = await Promise.all([loadProducts(ADMIN_PRODUCT_SELECT_BASE), loadCategories(ADMIN_CATEGORY_SELECT_BASE)]);
        familiesSupported.current = false;
      }
      const [recommendationRes, colorRes, bundleRes] = await Promise.all([
        client.from("product_recommendations").select("product_id, recommended_product_id, kind, position"),
        client.from("gem_colors").select(ADMIN_GEM_COLOR_SELECT).order("position"),
        client.from("product_bundle_items").select(BUNDLE_SELECT),
      ]);
      if (cancelled) return;
      // A database without `…_product_bundles` has no kits: the catalogue still loads.
      if (bundleRes.error) console.warn("Admin catalogue: kits unavailable", bundleRes.error);
      bundlesSupported.current = !bundleRes.error;
      const bundles = rowsToBundles((bundleRes.data ?? []) as BundleRow[]);
      const error = productRes.error ?? categoryRes.error ?? recommendationRes.error ?? colorRes.error;
      if (error) {
        console.error("Admin catalogue load failed", error);
        setLoadError(catalogErrorKind(error));
      } else {
        setProducts(
          (productRes.data as unknown as ProductRow[]).map((row) => withBundle(rowToProduct(row, publicUrl), bundles)),
        );
        setCategories((categoryRes.data as unknown as CategoryRow[]).map(rowToCategory));
        setRecommendations((recommendationRes.data as RecommendationRow[]).map(rowToRecommendation));
        setGemColors((colorRes.data as unknown as GemColorRow[]).map(rowToGemColor));
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
    (error: { code?: string; message?: string; hint?: string; status?: number | string } | null | undefined): never => {
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

  /**
   * Reads one product back after a write and puts it at the top of the list,
   * with the kits holding it: their stock moved with it (decision 117).
   */
  const refresh = useCallback(
    async (id: string): Promise<AdminProduct> => {
      const select = familiesSupported.current ? ADMIN_PRODUCT_SELECT : ADMIN_PRODUCT_SELECT_BASE;
      const kitIds = kitsContaining(id, productsRef.current).map((kit) => kit.id);
      const [fresh, kits, bundleRes] = await Promise.all([
        client.from("products").select(select).eq("id", id).single(),
        kitIds.length > 0
          ? client.from("products").select(select).in("id", kitIds)
          : Promise.resolve({ data: [] as unknown[], error: null }),
        bundlesSupported.current
          ? client.from("product_bundle_items").select(BUNDLE_SELECT).in("bundle_product_id", [id, ...kitIds])
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);
      if (fresh.error) return fail(fresh.error);
      const bundles = rowsToBundles((bundleRes.data ?? []) as BundleRow[]);
      const saved = withBundle(rowToProduct(fresh.data as unknown as ProductRow, publicUrl), bundles);
      const kitRows = kits.error ? [] : ((kits.data ?? []) as unknown as ProductRow[]);
      const freshKits = new Map(kitRows.map((row) => [row.id, withBundle(rowToProduct(row, publicUrl), bundles)]));
      setProducts((prev) => [
        saved,
        ...prev.filter((p) => p.id !== saved.id).map((p) => freshKits.get(p.id) ?? p),
      ]);
      return saved;
    },
    [client, fail, publicUrl],
  );

  /** One write path for create, edit, status changes and duplicates. */
  const save = useCallback(
    async (product: AdminProduct): Promise<AdminProduct> => {
      const before = productsRef.current.find((p) => p.id === product.id);
      // The kit's count is the database's, also while a product turns into a kit or back.
      const kitChange = product.bundle !== undefined || isBundle(before);
      if (kitChange && !bundlesSupported.current) {
        return fail({ code: "PGRST202", message: "kits are not available on this database yet" });
      }
      let payload;
      try {
        payload = productToPayload(product, { derivedStock: kitChange });
      } catch (error) {
        return fail({ code: "22023", message: String(error) });
      }
      const { data, error } = await client.rpc("admin_save_product", { p_product: payload });
      if (error) return fail(error);

      const result = data as {
        id: string;
        removed_paths?: string[];
        variants?: string[];
        custom_variants?: string[];
        family_id?: string | null;
        specs?: boolean;
        variant_options?: boolean;
      };
      await removeFiles(result.removed_paths ?? []);
      // A database without the pack/SS, variants or families migration saves
      // the product and ignores the rest: say so rather than pretend it was saved.
      if (product.gemOptions && !Array.isArray(result.variants)) {
        return fail({ code: "PGRST202", message: "admin_save_product() does not save gem options yet" });
      }
      if (product.customVariants && !Array.isArray(result.custom_variants)) {
        return fail({ code: "PGRST202", message: "admin_save_product() does not save variants yet" });
      }
      if ((product.variantOptions?.length ?? 0) > 0 && product.customVariants && !result.variant_options) {
        return fail({ code: "PGRST202", message: "admin_save_product() does not save variant options yet" });
      }
      if (product.familyId && !("family_id" in result)) {
        return fail({ code: "PGRST202", message: "admin_save_product() does not save families yet" });
      }
      if (!result.specs) {
        return fail({ code: "PGRST202", message: "admin_save_product() does not save characteristics yet" });
      }

      // Composition after the product, only when it changed. A refusal leaves
      // the product saved with its former composition (the error says why).
      if (kitChange && !sameBundle(product.bundle, before?.bundle)) {
        const { error: bundleError } = await client.rpc("admin_save_product_bundle", {
          p_product_id: result.id,
          p_components: bundlePayload(product.bundle),
        });
        if (bundleError) {
          await refresh(result.id).catch(() => undefined);
          return fail(bundleError);
        }
      }

      return refresh(result.id);
    },
    [client, fail, refresh, removeFiles],
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

  /**
   * Quick stock change (decision 91): relative and atomic in the database, so
   * it never overwrites a sale the list did not show. When the shelf moved
   * under an exact count, the product is read again before the refusal is
   * reported, so the pop-up shows the count to start from.
   */
  const adjustStock = useCallback(
    async (id: string, variantKey: string | null, delta: number, expected?: number) => {
      const current = productsRef.current.find((p) => p.id === id);
      if (!current) return undefined;
      const variantId =
        variantKey === null ? null : current.variantStock?.find((variant) => variant.key === variantKey)?.variantId;
      if (variantId === undefined) return fail({ code: "P0002", message: `unknown variant ${variantKey}` });
      const { error } = await client.rpc("admin_adjust_stock", {
        p_product_id: id,
        // The generated type does not know the argument is nullable.
        p_variant_id: variantId as string,
        p_delta: delta,
        ...(expected === undefined ? {} : { p_expected: expected }),
      });
      if (error) {
        if (error.code === "40001") await refresh(id).catch(() => undefined);
        return fail(error);
      }
      const saved = await refresh(id);
      log("updated", saved, STOCK_NOTE);
      return saved;
    },
    [client, fail, refresh, log],
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

      // The copy's variants and options are rows of their own, and its photos follow them.
      const variantIds = new Map((source.customVariants ?? []).map((variant) => [variant.id, crypto.randomUUID()]));
      const optionIds = new Map((source.variantOptions ?? []).map((option) => [option.id, crypto.randomUUID()]));
      const valueIds = new Map(
        (source.variantOptions ?? []).flatMap((option) => option.values.map((value) => [value.id, crypto.randomUUID()] as const)),
      );
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
        media: source.media.map((image, index) => ({
          ...image,
          id: `${UNSAVED_MEDIA_PREFIX}${index}`,
          variantId: image.variantId ? variantIds.get(image.variantId) : undefined,
          optionValueId: image.optionValueId ? valueIds.get(image.optionValueId) : undefined,
        })),
        customVariants: source.customVariants?.map((variant) => ({
          ...variant,
          id: variantIds.get(variant.id)!,
          ...(variant.optionValues ? { optionValues: variant.optionValues.map((id) => valueIds.get(id) ?? id) } : {}),
        })),
        variantOptions: source.variantOptions?.map((option) => ({
          ...option,
          id: optionIds.get(option.id)!,
          values: option.values.map((value) => ({ ...value, id: valueIds.get(value.id)! })),
        })),
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

  const fetchGemColor = useCallback(
    async (id: string) => {
      const { data, error } = await client.from("gem_colors").select(ADMIN_GEM_COLOR_SELECT).eq("id", id).single();
      if (error) return fail(error);
      return rowToGemColor(data as unknown as GemColorRow);
    },
    [client, fail],
  );

  const saveGemColor = useCallback(
    async (draft: GemColorDraft) => {
      const { data, error } = await client.rpc("admin_save_gem_color", { p_color: gemColorToPayload(draft) });
      if (error) return fail(error);
      const saved = await fetchGemColor((data as { id: string }).id);
      setGemColors((prev) =>
        prev.some((c) => c.id === saved.id) ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved],
      );
      return saved;
    },
    [client, fail, fetchGemColor],
  );

  const deleteGemColor = useCallback(
    async (id: string) => {
      const { error } = await client.rpc("admin_delete_gem_color", { p_id: id });
      if (error) fail(error);
      setGemColors((prev) => prev.filter((c) => c.id !== id));
    },
    [client, fail],
  );

  const reorderGemColors = useCallback(
    async (ids: string[]) => {
      const { error } = await client.rpc("admin_reorder_gem_colors", { p_ids: ids });
      if (error) fail(error);
      setGemColors((prev) =>
        ids.flatMap((id, position) => {
          const color = prev.find((c) => c.id === id);
          return color ? [{ ...color, position }] : [];
        }),
      );
    },
    [client, fail],
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
      adjustStock,
      duplicateProduct,
      deleteProduct,
      blankProduct,
      uploadImage,
      recommendationsFor,
      saveRecommendations,
      gemColors,
      saveGemColor,
      deleteGemColor,
      reorderGemColors,
    }),
    [
      gemColors,
      saveGemColor,
      deleteGemColor,
      reorderGemColors,
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
      adjustStock,
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

/** The product with its kit composition, when it is a kit. */
function withBundle(product: AdminProduct, bundles: Map<string, BundleComponent[]>): AdminProduct {
  const bundle = bundles.get(product.id);
  return bundle ? { ...product, bundle } : product;
}
