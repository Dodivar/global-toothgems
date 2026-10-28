import type { AdminProduct, BundleComponent } from "../data/adminCatalog";
import type { Json } from "./supabase/database.types";

/**
 * Kits whose stock is their components' (decision 117, migration
 * `…_product_bundles`).
 *
 * The database owns the rule: a kit's `inventory_items` row holds how many
 * kits the components' sellable stock (on hand − reserved) can make, kept up
 * to date by a trigger, and an order of a kit reserves its components. This
 * module only reads the composition for the back office and shows the same
 * figure while the form is edited (`bundleCapacity`, same formula as
 * `private.refresh_bundle_stock()`). Pure, unit-tested (`productBundles.test.ts`).
 */

/** Same bounds as `product_bundle_items.quantity`. */
export const BUNDLE_QUANTITY_MAX = 1000;

/** Columns the back office reads from `product_bundle_items`. */
export const BUNDLE_SELECT = "bundle_product_id, component_product_id, component_variant_id, quantity, position";

export interface BundleRow {
  bundle_product_id: string;
  component_product_id: string;
  component_variant_id: string | null;
  quantity: number;
  position: number;
}

/** Compositions by kit id, components in their saved order. */
export function rowsToBundles(rows: BundleRow[]): Map<string, BundleComponent[]> {
  const bundles = new Map<string, BundleComponent[]>();
  for (const row of [...rows].sort((a, b) => a.position - b.position)) {
    const list = bundles.get(row.bundle_product_id) ?? [];
    list.push({
      productId: row.component_product_id,
      ...(row.component_variant_id ? { variantId: row.component_variant_id } : {}),
      quantity: row.quantity,
    });
    bundles.set(row.bundle_product_id, list);
  }
  return bundles;
}

/** A kit: a product with at least one component. */
export function isBundle(product: Pick<AdminProduct, "bundle"> | undefined): boolean {
  return (product?.bundle?.length ?? 0) > 0;
}

/** Same components, quantities and order. */
export function sameBundle(a: BundleComponent[] | undefined, b: BundleComponent[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.productId === right[index].productId &&
        (item.variantId ?? null) === (right[index].variantId ?? null) &&
        item.quantity === right[index].quantity,
    )
  );
}

/** Argument of `admin_save_product_bundle()`; [] makes the product an ordinary one again. */
export function bundlePayload(components: BundleComponent[] | undefined): Json {
  return (components ?? []).map((item) => ({
    product_id: item.productId,
    variant_id: item.variantId ?? null,
    quantity: item.quantity,
  }));
}

/** Key of a component in lists: product, and variant when there is one. */
export function componentKey(item: Pick<BundleComponent, "productId" | "variantId">): string {
  return `${item.productId}/${item.variantId ?? ""}`;
}

/** A component's stock as the back office last read it. */
export interface ComponentStock {
  component: BundleComponent;
  product?: AdminProduct;
  /** Sellable units (on hand − reserved), never below 0; undefined when not tracked. */
  available?: number;
  /** Kits this component alone can make; undefined = no limit (untracked and available). */
  makes?: number;
}

export interface BundleCapacity {
  /** Kits the components can make; undefined when no component is tracked and none is out of stock. */
  buildable?: number;
  components: ComponentStock[];
  /** The components holding the figure down (several when they tie). */
  limiting: ComponentStock[];
}

/**
 * How many kits the components can make, from the products the back office
 * holds. Mirrors `private.refresh_bundle_stock()`: a tracked component makes
 * ⌊sellable ÷ units per kit⌋, an untracked one is no limit unless marked out
 * of stock, and a component the list does not know (or an option it no
 * longer sells) makes none.
 */
export function bundleCapacity(components: BundleComponent[], products: AdminProduct[]): BundleCapacity {
  const rows: ComponentStock[] = components.map((component) => {
    const product = products.find((p) => p.id === component.productId);
    const stock = component.variantId
      ? product?.variantStock?.find((variant) => variant.variantId === component.variantId)
      : product && !product.variantCount
        ? product
        : undefined;
    if (!stock) return { component, product, makes: 0 };
    if (!stock.trackInventory) {
      return { component, product, ...(stock.availability === "out_of_stock" ? { makes: 0 } : {}) };
    }
    const available = Math.max(0, stock.stock - (stock.reserved ?? 0));
    return { component, product, available, makes: Math.floor(available / Math.max(1, component.quantity)) };
  });

  const limits = rows.map((row) => row.makes).filter((makes): makes is number => makes !== undefined);
  const buildable = limits.length > 0 ? Math.min(...limits) : undefined;
  return {
    buildable,
    components: rows,
    limiting: buildable === undefined ? [] : rows.filter((row) => row.makes === buildable),
  };
}

/** Kits holding this product (or one of its variants) as a component. */
export function kitsContaining(productId: string, products: AdminProduct[]): AdminProduct[] {
  return products.filter((product) => product.bundle?.some((item) => item.productId === productId));
}

/** Form check of a kit's list; the database checks it again. */
export function bundleError(
  bundle: BundleComponent[] | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | undefined {
  if (bundle === undefined) return undefined;
  if (bundle.length === 0) return t("admin.form.errors.bundleEmpty");
  if (bundle.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > BUNDLE_QUANTITY_MAX)) {
    return t("admin.form.errors.bundleQuantity", { max: BUNDLE_QUANTITY_MAX });
  }
  return undefined;
}
