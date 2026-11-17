import type { CSSProperties } from "react";
import { GLOWBOOK_COLORS } from "../../lib/studioWorkspace/glowbookLook";

/**
 * The Glowbook's colours as CSS variables, for the public page and the
 * previews in the Studio. Since decision 150 every page has the same ones,
 * and since decision 152 they are Global Toothgems' own (`index.css`): a pale
 * blue page, white cards, the green call to action with ink text. Same output
 * on the server and in the browser.
 *
 *   --gb-cta / --gb-on-cta / --gb-cta-hover   the green call to action (book, try the Studio)
 *   --gb-brand / --gb-on-brand                the brand's pale blue (chosen section, "spotlight" badge)
 *   --gb-accent / --gb-on-accent              the deep blue for icons, focus, the default avatar
 *   --gb-page / --gb-card / --gb-soft         page, cards, tinted bands and picture backgrounds
 *   --gb-text / --gb-muted / --gb-border
 */
const THEME = {
  "--gb-cta": GLOWBOOK_COLORS.cta,
  "--gb-on-cta": "#111111",
  "--gb-cta-hover": "#8ff0cb",
  "--gb-brand": "#b9cde5",
  "--gb-on-brand": "#111111",
  "--gb-accent": GLOWBOOK_COLORS.solid,
  "--gb-on-accent": "#ffffff",
  "--gb-page": "#f4f8fc",
  "--gb-card": "#ffffff",
  "--gb-soft": GLOWBOOK_COLORS.soft,
  "--gb-text": "#111111",
  "--gb-muted": "#5c5c5c",
  "--gb-border": "rgba(63,90,117,.16)",
} as CSSProperties;

export function glowbookThemeStyle(): CSSProperties {
  return THEME;
}
