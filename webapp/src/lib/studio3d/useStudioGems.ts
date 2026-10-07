import { useEffect, useMemo, useState } from "react";
import type { GemColorDef, Product } from "../../data/products";
import { useCatalog } from "../catalog/CatalogProvider";
import { isSupabaseConfigured, requireSupabase } from "../supabase/client";
import type { PlacedJewelry } from "../../data/studioEditor";
import { buildStudioGems, estimateComposition, type CompositionEstimate, type GemAppearanceRow, type StudioGem } from "./gemCatalog";
import { setStudioGems } from "./gemRegistry";

/**
 * The Studio's gems for the React panels, built from the storefront catalogue
 * already loaded by `CatalogProvider` plus the Studio's drawing rows, and
 * pushed to `gemRegistry` for the engine.
 *
 * The drawing rows are read once per visit (they change only when the team
 * edits a gem). If they cannot be read, every gem falls back to its shop shape
 * and colour rather than leaving the library empty.
 */

type AppearanceState = { status: "loading" | "ready"; rows: GemAppearanceRow[] };

let cached: Promise<GemAppearanceRow[]> | null = null;

function loadAppearances(): Promise<GemAppearanceRow[]> {
  if (!isSupabaseConfigured) return Promise.resolve([]);
  cached ??= Promise.resolve(
    requireSupabase().from("studio_gem_appearances").select("product_id, variant_id, shape, material, color, effect"),
  ).then(({ data, error }) => {
    if (error) {
      cached = null; // the next visit of the editor tries again
      console.warn("[studio] gem appearances unavailable", error.message);
      return [];
    }
    return data ?? [];
  });
  return cached;
}

const EMPTY: { gems: StudioGem[]; byKey: Map<string, StudioGem> } = { gems: [], byKey: new Map() };

/**
 * Many panels read the gems at once: the list is built once per set of
 * inputs and shared, so every panel holds the very same objects.
 */
let last: { products: Product[]; rows: GemAppearanceRow[]; colors: GemColorDef[]; value: typeof EMPTY } | null = null;
function built(products: Product[], rows: GemAppearanceRow[], colors: GemColorDef[]) {
  if (last && last.products === products && last.rows === rows && last.colors === colors) return last.value;
  const gems = buildStudioGems(products, rows, colors);
  last = { products, rows, colors, value: { gems, byKey: new Map(gems.map((g) => [g.key, g])) } };
  return last.value;
}

export interface StudioGemsState {
  /** `loading` until both the catalogue and the drawing rows are in. */
  status: "loading" | "ready" | "error";
  gems: StudioGem[];
  byKey: Map<string, StudioGem>;
  reload: () => void;
}

export function useStudioGems(): StudioGemsState {
  const catalog = useCatalog();
  const [appearances, setAppearances] = useState<AppearanceState>({ status: isSupabaseConfigured ? "loading" : "ready", rows: [] });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true;
    loadAppearances().then((rows) => {
      if (live) setAppearances({ status: "ready", rows });
    });
    return () => {
      live = false;
    };
  }, []);

  const ready = catalog.status === "ready" && appearances.status === "ready";
  const { gems, byKey } = useMemo(
    () => (ready ? built(catalog.products, appearances.rows, catalog.colors) : EMPTY),
    [ready, catalog.products, catalog.colors, appearances.rows],
  );

  useEffect(() => {
    if (gems.length) setStudioGems(gems);
  }, [gems]);

  const status = catalog.status === "error" ? "error" : catalog.status === "ready" && appearances.status === "ready" ? "ready" : "loading";
  return { status, gems, byKey, reload: catalog.reload };
}

/** The indicative shop value of these pieces (`estimateComposition`), at the prices loaded. */
export function useCompositionEstimate(pieces: Pick<PlacedJewelry, "productId" | "variantId" | "look">[]): CompositionEstimate {
  const { byKey } = useStudioGems();
  return useMemo(() => estimateComposition(pieces, (key) => byKey.get(key)), [pieces, byKey]);
}
