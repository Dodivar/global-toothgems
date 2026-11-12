import posthog from "posthog-js";

/**
 * What every product-analytics module (`shopAnalytics.ts`,
 * `academyAnalytics.ts`, `authAnalytics.ts`) shares:
 *
 * - **consent**: nothing is sent or stored unless PostHog is loaded and opted
 *   in, which `lib/posthogSession.tsx` does only with the visitor's
 *   analytics consent;
 * - **never in the way**: a missing or failing PostHog is swallowed;
 * - **once**: an event that must count once per key in this tab (a reload,
 *   a remount) is guarded in session storage under a module prefix
 *   (`gt-shop-evt:`, `gt-academy-evt:`), listed in the cookie policy.
 *
 * The Studio keeps its own module (`studioAnalytics.ts`), older and richer.
 */

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export function analyticsEnabled(): boolean {
  try {
    return posthog.__loaded === true && posthog.has_opted_in_capturing();
  } catch {
    return false;
  }
}

/** Sends one event, if allowed. Never throws. */
export function captureEvent(event: string, props: AnalyticsProps = {}) {
  if (!analyticsEnabled()) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* analytics must never break the site */
  }
}

const seenInPage = new Set<string>();

/** `captureEvent` at most once per `storageKey` in this tab. */
export function captureOnce(storageKey: string, event: string, props: AnalyticsProps = {}) {
  if (!analyticsEnabled()) return;
  if (seenInPage.has(storageKey)) return;
  seenInPage.add(storageKey);
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    /* blocked storage: the in-page guard above still holds */
  }
  captureEvent(event, props);
}
