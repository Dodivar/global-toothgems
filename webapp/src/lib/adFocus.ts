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
 * storage and attribute helpers, which never throw.
 *
 * No flash: the storefront chrome is rendered on the server like any page, and
 * `focusBootScript()` — inline in the `<head>` of the root layout — marks `<html>`
 * with `data-gt-focus` before the first paint; CSS (`index.css`) then hides the
 * storefront header/footer and shows the focus bar/footer. After hydration
 * `AppShell` keeps the attribute in step with the page (`syncFocusAttribute`). Navigation only: nothing here is a
 * permission.
 */

import { localizedPath } from "./localeRoutes";
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

/** The attribute on `<html>` that switches the chrome (CSS in `index.css`). */
export const FOCUS_ATTRIBUTE = "data-gt-focus";

/** Marks or unmarks `<html>` for the page at `pathname`. Browser only. */
export function syncFocusAttribute(pathname: string, search: string): void {
  const root = document.documentElement;
  if (isFocusedPage(pathname, search)) root.setAttribute(FOCUS_ATTRIBUTE, "");
  else root.removeAttribute(FOCUS_ATTRIBUTE);
}

/**
 * The script run in the `<head>` before the page paints: the same rule as
 * `isFocusedPage`, written for the browser's own address (language-prefixed
 * public paths). A string, so it can be inlined; kept equal to the functions
 * above by `adFocus.test.ts`.
 */
export function focusBootScript(): string {
  const paths = (["fr", "en"] as const).flatMap((locale) => [localizedPath("studio", locale), localizedPath("studioSubscribe", locale)]);
  return `(function(){try{var p=location.pathname.replace(/\\/+$/,"")||"/";if(${JSON.stringify(paths)}.indexOf(p)<0)return;var q=new URLSearchParams(location.search);var hit=q.get("focus")==="1";${JSON.stringify([...CLICK_IDS, ...UTM_KEYS])}.forEach(function(k){if((q.get(k)||"").trim()!=="")hit=true});if(hit)sessionStorage.setItem(${JSON.stringify(STORAGE_KEY)},"1");else hit=sessionStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="1";if(hit)document.documentElement.setAttribute(${JSON.stringify(FOCUS_ATTRIBUTE)},"")}catch(e){}})();`;
}
