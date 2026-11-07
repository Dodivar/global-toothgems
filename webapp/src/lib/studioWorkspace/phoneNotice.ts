/**
 * The "better on a tablet or a computer" notice shown when the 3D Studio is
 * opened on a phone (decision 124). A phone is a touch device whose screen is
 * small on both sides: the shorter side under 600 CSS pixels (tablets start
 * above, an iPad mini is 744), so a narrow desktop window or a tablet never
 * sees it. Browser-only: read it from an effect, never during render.
 */

/** Shorter screen side, in CSS pixels, under which a touch device counts as a phone. */
export const PHONE_MAX_SHORT_SIDE = 600;

const SEEN_KEY = "gt-studio3d-phone-notice";

/** Pure rule, tested: touch input (`pointer: coarse`) and a small screen. */
export function isPhoneScreen(coarsePointer: boolean, screenWidth: number, screenHeight: number): boolean {
  const shortSide = Math.min(screenWidth, screenHeight);
  return coarsePointer && shortSide > 0 && shortSide < PHONE_MAX_SHORT_SIDE;
}

export function isPhoneDevice(): boolean {
  if (typeof window === "undefined") return false;
  return isPhoneScreen(window.matchMedia("(pointer: coarse)").matches, window.screen.width, window.screen.height);
}

/** Shown once per browser session: a reminder at every page change would only annoy. */
export function phoneNoticeSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return true; // storage blocked: never nag on every visit
  }
}

export function rememberPhoneNotice() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* the notice lasts for this visit */
  }
}
