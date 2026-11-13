import { parsePath, type PublicRouteId } from "./localeRoutes";
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
 * The pages the pixel may see: the shop's own pages only, as the cookie
 * policy says — home, catalogue, product pages, shapes, colours, cart and its
 * confirmation, gift cards, the loyalty programme. An allow-list of public
 * route ids, so a new page is not tracked until someone decides it should be.
 * Never the 3D Studio's pages (sold by the publisher, another seller,
 * decision 135), the Glowbook (artists' pages), the Academy, help, legal and
 * contact pages, the guest withdrawal page (its e-mailed link leads to an
 * order's lines and e-mail), nor anything outside `/fr` and `/en` (member
 * space, back office, sign-in, Studio workspace, learner pages).
 */
const PIXEL_ROUTES: ReadonlySet<PublicRouteId> = new Set<PublicRouteId>([
  "home",
  "shop",
  "product",
  "shapes",
  "colours",
  "cart",
  "checkoutReturn",
  "giftCard",
  "loyalty",
]);

export function pixelAllowedPath(pathname: string): boolean {
  const route = parsePath(pathname.split(/[?#]/)[0] ?? "").route;
  return route !== null && PIXEL_ROUTES.has(route.id);
}
