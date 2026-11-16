import type { CSSProperties } from "react";
import { GLOWBOOK_COLORS } from "../../lib/studioWorkspace/glowbookLook";

/**
 * The Glowbook's colours as CSS variables, for the public page and the
 * previews in the Studio. Since decision 150 every page has the same ones
 * (ink on a light page, the former default look); the artist no longer
 * chooses them. Same output on the server and in the browser.
 *
 *   --gb-accent / --gb-on-accent   the accent colour and the text on it
 *   --gb-page / --gb-card          page and card backgrounds
 *   --gb-text / --gb-muted / --gb-border / --gb-soft
 */
const THEME = {
  "--gb-accent": GLOWBOOK_COLORS.solid,
  "--gb-on-accent": "#ffffff",
  "--gb-page": "#fbfbfc",
  "--gb-card": "#ffffff",
  "--gb-text": "#16171b",
  "--gb-muted": "#5d6068",
  "--gb-border": "rgba(20,22,28,.10)",
  "--gb-soft": GLOWBOOK_COLORS.soft,
} as CSSProperties;

export function glowbookThemeStyle(): CSSProperties {
  return THEME;
}
