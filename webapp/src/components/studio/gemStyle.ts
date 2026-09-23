import { useId } from "react";
import type { StudioMaterial } from "../../data/studio";

/** Material colours of the rendered pieces, shared by the SVG gradients and the CSS swatches. */
export const STOPS: Record<StudioMaterial, [string, string, string]> = {
  crystal: ["#ffffff", "#d7e3f1", "#8ea6c4"],
  sapphire: ["#dce8ff", "#5b87d8", "#1d3c86"],
  rose: ["#ffe3f0", "#e0479b", "#8e0f52"],
  emerald: ["#e2fff2", "#3edba0", "#0b6e50"],
  gold: ["#fff3c9", "#e3b85a", "#9a6a1a"],
  opal: ["#ffffff", "#efe3f6", "#a9cfe0"],
};

/** Material swatch colour, for chips and radio buttons. */
export const MATERIAL_SWATCH: Record<StudioMaterial, string> = {
  crystal: "linear-gradient(135deg,#fff,#c9d7e8)",
  sapphire: "linear-gradient(135deg,#9dbbf0,#1d3c86)",
  rose: "linear-gradient(135deg,#ffc6e0,#c21e77)",
  emerald: "linear-gradient(135deg,#a9f3d4,#0b7e5b)",
  gold: "linear-gradient(135deg,#fff0c0,#b8862a)",
  opal: "linear-gradient(135deg,#fff,#e9d9f2 50%,#bfe0ee)",
};

/** SVG ids must be plain: React's ids carry characters `url(#…)` rejects. */
export function useSvgPrefix() {
  return `gts${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
