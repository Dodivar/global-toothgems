import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "./supabase/client";
import { fetchProductVariants } from "./promotionsApi";

/** The active options of a product, read when it is chosen; empty while loading, without options, or in mock mode. */
export function useProductVariants(productId: string | undefined): { id: string; name: string }[] {
  const [loaded, setLoaded] = useState<{ productId: string; variants: { id: string; name: string }[] } | null>(null);
  useEffect(() => {
    if (!productId || !isSupabaseConfigured) return;
    let current = true;
    fetchProductVariants(productId)
      .then((variants) => current && setLoaded({ productId, variants }))
      .catch((error: unknown) => console.error("[promotions] variants", error instanceof Error ? error.message : error));
    return () => {
      current = false;
    };
  }, [productId]);
  return loaded && loaded.productId === productId ? loaded.variants : [];
}
