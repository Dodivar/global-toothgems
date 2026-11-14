"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { CartLine } from "./checkout/cartLines";
import { toMajorUnits } from "./catalog/money";
import { useCookieConsent } from "./cookieConsent";
import { ADVERTISING_ENABLED, META_PIXEL_ID, pixelAllowedPath } from "./metaPixelConfig";

/**
 * The Meta Pixel (owner's decision, 2026-11-13; `docs/product-feeds.md`):
 * a browser pixel only, loaded strictly after the visitor accepts the
 * "advertising" cookie category (`lib/cookieConsent.tsx`), and only on the
 * public storefront pages (`pixelAllowedPath`).
 *
 * - Nothing is loaded before consent; withdrawing it revokes the pixel at
 *   once (`fbq('consent', 'revoke')`), erases its `_fbp` / `_fbc` cookies and
 *   stops every event. Leaving the storefront (member space, Studio…) revokes
 *   it too, until the visitor comes back to a storefront page.
 * - No personal data: no e-mail, name or phone is ever passed; automatic
 *   configuration (button clicks, page metadata) and the pixel's own history
 *   tracking are off, so only the events below leave, with product ids that
 *   match the product feeds' `id` (variant id, else product id).
 * - Events: PageView (each storefront page, including client-side moves),
 *   ViewContent (product page), AddToCart, InitiateCheckout, Purchase (once
 *   per order, its number as the event id).
 * - Never in the way: every call is guarded.
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
  disablePushState?: boolean;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** Whether events may leave now: loaded, consented, on a storefront page. */
let granted = false;

/**
 * Events asked for before the consent was read: a page's own effects run
 * before `MetaPixel`'s, and the choice is known only once hydrated. Sent once
 * the pixel is granted on that same page, dropped as soon as it is not.
 */
let pending: { path: string; args: unknown[] }[] = [];
const PENDING_MAX = 10;

function currentPath(): string {
  return window.location.pathname;
}

function loadPixel(): Fbq {
  if (window.fbq) return window.fbq;
  // Meta's standard loader, written out: a queue until fbevents.js arrives.
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  // No automatic PageView on history changes: we send our own, on storefront pages only.
  fbq.disablePushState = true;
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  // No automatic events (clicks, page metadata) and no user data: the id alone.
  fbq("set", "autoConfig", false, META_PIXEL_ID);
  fbq("init", META_PIXEL_ID);
  return fbq;
}

/** Erases the pixel's first-party cookies, on this host and its parent domains. */
function eraseCookies() {
  const parts = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i += 1) domains.push(`; domain=.${parts.slice(i).join(".")}`);
  for (const name of ["_fbp", "_fbc"]) {
    for (const domain of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
  }
}

/** Drives the pixel from the consent and the page; mounted once, under `CookieConsentProvider`. */
export function MetaPixel() {
  const { record, known } = useCookieConsent();
  const pathname = usePathname() ?? "/";
  const consented = ADVERTISING_ENABLED && record?.advertising === true;
  const active = consented && pixelAllowedPath(pathname);

  useEffect(() => {
    // The stored choice is read once hydrated: until then, decide nothing.
    if (!known) return;
    try {
      if (active) {
        const fbq = loadPixel();
        fbq("consent", "grant");
        granted = true;
        fbq("track", "PageView");
        const queued = pending.filter((event) => event.path === pathname);
        pending = [];
        for (const event of queued) fbq(...event.args);
        return;
      }
      granted = false;
      pending = [];
      if (window.fbq) window.fbq("consent", "revoke");
      if (!consented) eraseCookies();
    } catch {
      /* advertising must never break the site */
    }
  }, [known, active, consented, pathname]);

  return null;
}

export type PixelEvent = "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase";
export type PixelParams = Record<string, string | number | string[] | { id: string; quantity: number }[]>;

/** Sends one standard event, if allowed now. Never throws. */
export function trackPixel(event: PixelEvent, params: PixelParams, eventId?: string) {
  if (!ADVERTISING_ENABLED || typeof window === "undefined") return;
  const args: unknown[] = ["track", event, params, ...(eventId ? [{ eventID: eventId }] : [])];
  try {
    if (granted && window.fbq) window.fbq(...args);
    else if (pixelAllowedPath(currentPath()) && pending.length < PENDING_MAX) pending.push({ path: currentPath(), args });
  } catch {
    /* advertising must never break the site */
  }
}

const sentInPage = new Set<string>();

/**
 * `trackPixel` at most once per key in this tab (a reload of the confirmation
 * page does not count an order twice). Its own guard: the analytics one
 * (`analyticsCore.ts`) stands only with the analytics consent. Only once the
 * pixel is granted (a purchase is always reported after the consent was
 * read): nothing is written to the browser without the advertising consent.
 */
export function trackPixelOnce(key: string, event: PixelEvent, params: PixelParams, eventId?: string) {
  if (!granted || typeof window === "undefined" || sentInPage.has(key)) return;
  sentInPage.add(key);
  try {
    const storageKey = `gt-pixel-evt:${key}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    /* blocked storage: the in-page guard above still holds */
  }
  trackPixel(event, params, eventId);
}

/** The id the feeds give an item: its variant's, else its product's (absent on mock and course lines). */
export function pixelContentId(item: { variantId?: string | null; dbProductId?: string | null }): string | undefined {
  return item.variantId ?? item.dbProductId ?? undefined;
}

/**
 * A basket's products as the pixel reads them: the feeds' ids, quantities and
 * value (major units, from the cart's indicative minor units; the order is
 * priced by the database). Courses and gift cards are not catalogue products
 * and are left out of the ids, but counted in the value.
 */
export function pixelBasket(lines: readonly CartLine[]): PixelParams {
  const contents = lines
    .filter((line) => !line.courseId && !line.giftCard)
    .flatMap((line) => {
      const id = pixelContentId(line);
      return id ? [{ id, quantity: line.qty }] : [];
    });
  const minor = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  return {
    content_type: "product",
    content_ids: contents.map((c) => c.id),
    contents,
    num_items: lines.reduce((count, line) => count + line.qty, 0),
    value: toMajorUnits(minor),
    currency: lines[0]?.currency ?? "EUR",
  };
}
