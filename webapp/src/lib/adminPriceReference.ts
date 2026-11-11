import { requireSupabase } from "./supabase/client";
import type { PriceReferenceState } from "./storefrontOffers";

/**
 * The back office's read-only view of a product's reference price (decision 129, Omnibus):
 * `admin_price_references(product)`, manage_products only. The figures are computed by the database from the
 * price history the triggers write; nothing here can change them.
 */

export interface AdminPriceReferenceRow {
  variant_id: string | null;
  currency: string;
  list_price: number | string;
  price: number | string;
  reference_price: number | string | null;
  discount_percent: number | null;
  reduction_started_at: string | null;
  state: string;
}

export interface AdminPriceReference {
  /** Null for the product itself. */
  variantId: string | null;
  currency: string;
  listCents: number;
  /** Price now (the cut price while a promotion cuts it). */
  priceCents: number;
  /**
   * The reference price: while a reduction runs, the lowest price of the 30 days before it started; without one,
   * the lowest price of the last 30 days (what a reduction starting now would strike out). Null without history.
   */
  referenceCents: number | null;
  percent: number | null;
  startedAt: string | null;
  state: PriceReferenceState;
}

const STATES: readonly PriceReferenceState[] = ["reduced", "not_lower", "no_history", "no_reduction"];

const toCents = (value: number | string | null): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function mapAdminPriceReference(row: AdminPriceReferenceRow): AdminPriceReference | null {
  const listCents = toCents(row.list_price);
  const priceCents = toCents(row.price);
  if (listCents === null || priceCents === null) return null;
  const state = (STATES as readonly string[]).includes(row.state) ? (row.state as PriceReferenceState) : "not_lower";
  return {
    variantId: row.variant_id,
    currency: row.currency,
    listCents,
    priceCents,
    referenceCents: toCents(row.reference_price),
    percent: state === "reduced" ? row.discount_percent : null,
    startedAt: row.reduction_started_at,
    state,
  };
}

/** The product row first, then its active options. */
export async function fetchAdminPriceReferences(productId: string): Promise<AdminPriceReference[]> {
  const { data, error } = await requireSupabase().rpc("admin_price_references", { p_product_id: productId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AdminPriceReferenceRow[])
    .map(mapAdminPriceReference)
    .filter((r): r is AdminPriceReference => r !== null)
    .sort((a, b) => (a.variantId === null ? -1 : b.variantId === null ? 1 : 0));
}
