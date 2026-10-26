import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";

/**
 * Whether the shop sells under the VAT franchise ("franchise en base de TVA",
 * art. 293 B du CGI, decision 114): `store_settings.vat_franchise`, public by
 * design. The database charges the VAT (`vat_rate_bp()` is 0 under the
 * franchise); this only chooses the words the storefront shows beside a price —
 * "TVA non applicable, art. 293 B du CGI" or "VAT included".
 *
 * Read once per page load and shared. `null` until known, and in mock mode or
 * when the read fails: callers then show no VAT wording rather than a wrong one.
 * Never read during render, so server-rendered pages hydrate unchanged.
 */

let pending: Promise<boolean | null> | null = null;

function readVatFranchise(): Promise<boolean | null> {
  if (!supabase) return Promise.resolve(null);
  pending ??= Promise.resolve(supabase.from("store_settings").select("vat_franchise").eq("id", true).single()).then(
    ({ data, error }) => (error || !data ? null : data.vat_franchise),
    () => null,
  );
  return pending;
}

export function useVatFranchise(): boolean | null {
  const [franchise, setFranchise] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void readVatFranchise().then((value) => {
      if (live) setFranchise(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return franchise;
}

/** The i18n key of the VAT wording beside a price, or null when the regime is unknown. */
export function vatNoticeKey(franchise: boolean | null): "checkout.payment.vatFranchise" | "checkout.payment.vatIncluded" | null {
  if (franchise === null) return null;
  return franchise ? "checkout.payment.vatFranchise" : "checkout.payment.vatIncluded";
}
