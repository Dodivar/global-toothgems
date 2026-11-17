/**
 * Colours of the dental model on the 3D stage (owner's request 2026-11-17):
 * the natural resin, or a pastel that makes the cast read as a display stand
 * rather than real teeth — the brand blue first. Saved with the design
 * (`scene_data.modelShade`), so creations, posts, share links and Glowbook
 * viewers show the colour chosen; the AI try-on always renders the natural one.
 *
 * One list, so the owner can tune the colours in one place. `model` is the
 * 3D finish's base colour (pushed a little more saturated than the swatch:
 * tone mapping and the studio light pale it); `gum` is used only by the
 * procedural fallback arch, the default scan being one cast in one colour.
 */

export const MODEL_SHADES = [
  { id: "natural", swatch: "#f3ede2", model: 0xf3ede2, enamel: 0xf6f0e4, gum: 0xb96f7a },
  { id: "glacier", swatch: "#b9cde5", model: 0x93b1dc, enamel: 0x9fbae0, gum: 0x7f9cc4 },
  { id: "rose", swatch: "#f5cfe0", model: 0xefadcb, enamel: 0xf1b8d2, gum: 0xd890b2 },
  { id: "mint", swatch: "#c9eedd", model: 0x9fdec2, enamel: 0xabe2c9, gum: 0x7fc4a6 },
  { id: "lavender", swatch: "#dcd3f2", model: 0xbcade9, enamel: 0xc5b8ec, gum: 0x9f8fd0 },
  { id: "peach", swatch: "#f8dcc6", model: 0xf3bf98, enamel: 0xf5c8a6, gum: 0xd9a07e },
  { id: "pearl", swatch: "#dfe1e6", model: 0xc9cdd6, enamel: 0xd2d5dd, gum: 0xa4a9b4 },
] as const;

export type ModelShade = (typeof MODEL_SHADES)[number]["id"];
export type ModelShadeSpec = (typeof MODEL_SHADES)[number];

export const DEFAULT_MODEL_SHADE: ModelShade = "natural";

const IDS: readonly string[] = MODEL_SHADES.map((s) => s.id);

export function isModelShade(value: unknown): value is ModelShade {
  return typeof value === "string" && IDS.includes(value);
}

export function modelShadeSpec(shade: ModelShade): ModelShadeSpec {
  return MODEL_SHADES.find((s) => s.id === shade) ?? MODEL_SHADES[0];
}
