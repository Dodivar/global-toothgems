import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";

/**
 * Whether a business sells under the VAT franchise ("franchise en base de TVA",
 * art. 293 B du CGI, decision 114), public by design:
 *
 *   - the shop (goods, courses, gift cards — the seller): `store_settings.vat_franchise`;
 *   - the 3D Studio (the website publisher, decision 133): `store_settings.publisher_vat_franchise`.
 *
 * The database charges the VAT (`vat_rate_bp()` is 0 under the franchise; a
 * Studio invoice freezes the publisher's regime); this only chooses the words
 * shown beside a price — "TVA non applicable, art. 293 B du CGI" or "VAT included".
 *
 * Read once per page load and shared. `null` until known, and in mock mode or
 * when the read fails: callers then show no VAT wording rather than a wrong one.
 * Never read during render, so server-rendered pages hydrate unchanged.
 */

type Regimes = { shop: boolean; studio: boolean };

let pending: Promise<Regimes | null> | null = null;

function readRegimes(): Promise<Regimes | null> {
  if (!supabase) return Promise.resolve(null);
  pending ??= Promise.resolve(
    supabase.from("store_settings").select("vat_franchise, publisher_vat_franchise").eq("id", true).single(),
  ).then(
    ({ data, error }) => (error || !data ? null : { shop: data.vat_franchise, studio: data.publisher_vat_franchise }),
    () => null,
  );
  return pending;
}

function useFranchise(business: keyof Regimes): boolean | null {
  const [franchise, setFranchise] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void readRegimes().then((value) => {
      if (live) setFranchise(value ? value[business] : null);
    });
    return () => {
      live = false;
    };
  }, [business]);
  return franchise;
}

/** The shop's regime (seller): the cart, the checkout and the footer. */
export function useVatFranchise(): boolean | null {
  return useFranchise("shop");
}

/** The 3D Studio's regime (publisher): the Studio's plans and payment step. */
export function useStudioVatFranchise(): boolean | null {
  return useFranchise("studio");
}

/** The i18n key of the VAT wording beside a price, or null when the regime is unknown. */
export function vatNoticeKey(franchise: boolean | null): "checkout.payment.vatFranchise" | "checkout.payment.vatIncluded" | null {
  if (franchise === null) return null;
  return franchise ? "checkout.payment.vatFranchise" : "checkout.payment.vatIncluded";
}
