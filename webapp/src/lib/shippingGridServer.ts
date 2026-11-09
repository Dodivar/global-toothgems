import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { ShippingGridZone } from "../data/legal/shippingGrid";
import { CATALOGUE_TTL_SECONDS } from "./catalog/serverCatalog";
import { isSupabaseConfigured } from "./supabase/env";
import { createPublicServerSupabase } from "./supabase/publicServer";

/*
 * The active shipping zones, their countries and their active rates, as the
 * server reads them for the public shipping page: Supabase with the
 * publishable key (RLS lets everyone read what is active, as the cart does).
 * Same cache as the store details (`storeDetailsServer.ts`).
 */

async function fetchShippingGrid(): Promise<ShippingGridZone[]> {
  const supabase = createPublicServerSupabase();
  const { data, error } = await supabase
    .from("shipping_zones")
    .select(
      "name, position, is_rest_of_world, shipping_zone_countries(country_code), shipping_rates(kind, min_days, max_days, price, currency, free_over_amount, min_order_amount, min_weight_grams, max_weight_grams, position, is_active)",
    )
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((zone) => ({
    name: zone.name,
    position: zone.position,
    is_rest_of_world: zone.is_rest_of_world,
    countries: zone.shipping_zone_countries.map((row) => row.country_code),
    rates: zone.shipping_rates.filter((rate) => rate.is_active).map(({ is_active: _active, ...rate }) => rate),
  }));
}

const readShippingGrid = unstable_cache(fetchShippingGrid, ["shipping-grid"], {
  revalidate: CATALOGUE_TTL_SECONDS,
  tags: ["shipping-grid"],
});

/** The grid to publish, or null in mock mode or when the read fails: the page then keeps its generic wording. */
export const loadShippingGrid = cache(async (): Promise<ShippingGridZone[] | null> => {
  if (!isSupabaseConfigured) return null;
  try {
    return await readShippingGrid();
  } catch (error) {
    console.warn("[shipping grid] server read failed; the page keeps its generic wording", error);
    return null;
  }
});
