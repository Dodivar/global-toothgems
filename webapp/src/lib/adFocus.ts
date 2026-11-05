/**
 * "Focus" visits: a visitor who arrives on the 3D Studio's offer pages from a
 * social network or an advertisement sees those pages without the
 * storefront's header and footer (`AppShell`), so nothing leads them away
 * before they have tried the Studio.
 *
 * Campaign traffic is recognised by the parameters the networks and the ads
 * add to the link: UTM tags or a click id (`fbclid`, `ttclid`…). `focus=1` is
 * a manual switch for links that carry no tag. The choice is kept for the
 * browser tab (`sessionStorage`), so moving between the Studio's offer pages
 * does not bring the storefront back. Pure and side-effect free except for the
 * two storage helpers, which never throw. Navigation only: nothing here is a
 * permission.
 */

import { STUDIO_PATH, STUDIO_SUBSCRIBE_PATH } from "./studioUrl";

const CLICK_IDS = ["fbclid", "gclid", "ttclid", "igshid", "msclkid", "twclid"] as const;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
const STORAGE_KEY = "gt-studio-focus";

/** The pages a focus visit applies to: the Studio's presentation and its plans. */
export const FOCUS_PATHS: readonly string[] = [STUDIO_PATH, STUDIO_SUBSCRIBE_PATH];

export function isFocusPath(pathname: string): boolean {
  return FOCUS_PATHS.includes(pathname);
}

/** Whether the link's query marks campaign traffic. */
export function isCampaignVisit(search: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get("focus") === "1") return true;
  return [...CLICK_IDS, ...UTM_KEYS].some((key) => (params.get(key) ?? "").trim() !== "");
}

/** Remembers, for this tab, that the visit came from a campaign. Never throws. */
export function rememberFocusVisit(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private window or blocked storage: the page just keeps its chrome */
  }
}

function rememberedFocusVisit(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Whether the page at `pathname` is shown focused. Call it in the browser once
 * hydrated (the server never knows the query nor the tab's storage).
 */
export function isFocusedPage(pathname: string, search: string): boolean {
  if (!isFocusPath(pathname)) return false;
  return isCampaignVisit(search) || rememberedFocusVisit();
}
