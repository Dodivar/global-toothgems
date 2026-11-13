import { isSupabaseConfigured } from "./supabase/env";

/**
 * The Meta Pixel's switch (owner's decision, 2026-11-13: browser pixel only,
 * no Conversions API, strictly behind the "advertising" cookie category).
 *
 * `NEXT_PUBLIC_META_PIXEL_ID` is a public id, not a secret (Meta Events
 * Manager › Data sources). Written out in full: Next.js inlines
 * `process.env.NEXT_PUBLIC_*` only for literal references, so the server and
 * the browser read the same value (no hydration difference). Without it, or
 * in mock mode (the e2e suite), there is no pixel, no advertising category in
 * the cookie choices and no advertising wording in the cookie policy: a
 * switch that changes nothing would mislead.
 */
const raw = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? "";

export const META_PIXEL_ID = /^\d{5,20}$/.test(raw) ? raw : "";

export const ADVERTISING_ENABLED = META_PIXEL_ID !== "" && isSupabaseConfigured;

/**
 * Pages the pixel may see: the public storefront only (`/fr/…`, `/en/…`),
 * never the member space, the back office, sign-in, the Studio workspace or
 * the learner pages, and never the guest withdrawal page (its e-mailed link
 * leads to an order's lines and e-mail address). An allow-list, like
 * `replayAllowed()` (`posthogConfig.ts`).
 */
const PIXEL_EXCLUDED_PUBLIC = ["/fr/retours-remboursements/retractation", "/en/returns/withdrawal"];

export function pixelAllowedPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? "";
  if (PIXEL_EXCLUDED_PUBLIC.some((excluded) => path === excluded || path.startsWith(`${excluded}/`))) return false;
  return /^\/(fr|en)(\/|$)/.test(path);
}
