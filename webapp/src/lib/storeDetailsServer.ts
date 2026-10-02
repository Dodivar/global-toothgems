import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { StoreDetails } from "../data/adminSettings";
import { CATALOGUE_TTL_SECONDS } from "./catalog/serverCatalog";
import { isSupabaseConfigured } from "./supabase/env";
import { createPublicServerSupabase } from "./supabase/publicServer";
import { fetchStoreDetails } from "./storeDetails";

/*
 * The store's identity and contact details as the server reads them for the
 * public pages that publish them (legal notice, contact page): Supabase with
 * the publishable key (anonymous visitor, RLS "everyone reads"). Same cache as
 * the catalogue (`serverCatalog.ts`): shared by every request for
 * `CATALOGUE_TTL_SECONDS`, tagged `store-details`. A change saved in Settings
 * shows on those pages within that delay — the save runs in the browser, which
 * cannot invalidate the server cache.
 */

export const STORE_DETAILS_CACHE_TAG = "store-details";

const readStoreDetails = unstable_cache(() => fetchStoreDetails(createPublicServerSupabase()), ["store-details"], {
  revalidate: CATALOGUE_TTL_SECONDS,
  tags: [STORE_DETAILS_CACHE_TAG],
});

/**
 * The details to publish, or null in mock mode or when the read fails: the
 * pages then show what is still to be supplied, never invented values.
 */
export const loadStoreDetails = cache(async (): Promise<StoreDetails | null> => {
  if (!isSupabaseConfigured) return null;
  try {
    return await readStoreDetails();
  } catch (error) {
    console.warn("[store details] server read failed; the page shows its placeholders", error);
    return null;
  }
});
