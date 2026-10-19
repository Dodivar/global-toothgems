import type { CSSProperties } from "react";
import { ACCENT_COLORS, DEFAULT_LOOK, type GlowbookLook } from "../../lib/studioWorkspace/glowbookLook";

/**
 * A Glowbook's colours as CSS variables (decision 100), for the public page
 * and the preview in the Studio. Same output on the server and in the
 * browser: nothing here reads the browser.
 *
 *   --gb-accent / --gb-on-accent   the identity colour and the text on it
 *   --gb-page / --gb-card          page and card backgrounds
 *   --gb-text / --gb-muted / --gb-border
 */
export function glowbookThemeStyle(look: GlowbookLook | null): CSSProperties {
  const l = look ?? DEFAULT_LOOK;
  const c = ACCENT_COLORS[l.accent];
  const dark = l.background === "dark";
  return {
    "--gb-accent": dark ? c.bright : c.solid,
    "--gb-on-accent": dark ? "#141519" : "#ffffff",
    "--gb-page": dark ? "#121318" : l.background === "tinted" ? c.soft : "#fbfbfc",
    "--gb-card": dark ? "#1c1e25" : "#ffffff",
    "--gb-text": dark ? "#f3f3f5" : "#16171b",
    "--gb-muted": dark ? "#b4b6bf" : "#5d6068",
    "--gb-border": dark ? "rgba(255,255,255,.12)" : "rgba(20,22,28,.10)",
    "--gb-soft": dark ? "rgba(255,255,255,.06)" : c.soft,
  } as CSSProperties;
}
