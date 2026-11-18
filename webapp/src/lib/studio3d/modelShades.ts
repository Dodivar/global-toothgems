/**
 * Colours of the Studio's dentition (owner's request 2026-11-17): the cool
 * porcelain of the brand's reference smile, or a pastel that makes the crowns
 * read as a display stand rather than real teeth — the brand blue first.
 * Saved with the design (`scene_data.modelShade`), so creations, posts, share
 * links and Glowbook viewers show the colour chosen; the AI try-on always
 * renders the porcelain one.
 *
 * One list, so the owner can tune the colours in one place. `model` is the
 * crowns' base colour (a little more saturated than the swatch: tone mapping
 * and the studio light pale it). An imported model keeps its own colours.
 */

export const MODEL_SHADES = [
  { id: "porcelain", swatch: "#dfe6ee", model: 0xcbd6e3 },
  { id: "glacier", swatch: "#b9cde5", model: 0x93b1dc },
  { id: "rose", swatch: "#f5cfe0", model: 0xefadcb },
  { id: "mint", swatch: "#c9eedd", model: 0x9fdec2 },
  { id: "lavender", swatch: "#dcd3f2", model: 0xbcade9 },
  { id: "peach", swatch: "#f8dcc6", model: 0xf3bf98 },
  { id: "pearl", swatch: "#e4e4e2", model: 0xd4d4d2 },
] as const;

export type ModelShade = (typeof MODEL_SHADES)[number]["id"];
export type ModelShadeSpec = (typeof MODEL_SHADES)[number];

export const DEFAULT_MODEL_SHADE: ModelShade = "porcelain";

const IDS: readonly string[] = MODEL_SHADES.map((s) => s.id);

export function isModelShade(value: unknown): value is ModelShade {
  return typeof value === "string" && IDS.includes(value);
}

export function modelShadeSpec(shade: ModelShade): ModelShadeSpec {
  return MODEL_SHADES.find((s) => s.id === shade) ?? MODEL_SHADES[0];
}
