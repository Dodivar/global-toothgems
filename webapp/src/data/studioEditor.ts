/**
 * Reference data for the 3D Studio editor (`/studio-3d/atelier`).
 *
 * Pure data and pure functions only — no three.js, no React — so the catalog,
 * the dentition and the price estimate can be read and tested on their own.
 * Every label shown to a customer lives in the `studio.editor` translations;
 * this file only holds identifiers, geometry and numbers.
 */

/* ------------------------------------------------------------------ types */

/** A point or direction in the editor's world space (plain, serialisable). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One piece placed on the dentition. Serialisable as-is: this is the saved design. */
export interface PlacedJewelry {
  id: string;
  jewelryTypeId: string;
  /** FDI tooth number, or `FREE_TOOTH` on an unlabelled region of an imported model. */
  toothId: string;
  position: Vec3;
  normal: Vec3;
  /** Spin around the surface normal, in degrees. */
  rotation: number;
  /** Radius in millimetres; the diameter shown to the customer is twice this. */
  scale: number;
  /** A `FinishId`. */
  color: string;
  /** Hex override from the colour wheel. */
  customColor?: string;
  /** Manual standoff fine-tune from the enamel, in world units. */
  offset?: number;
}

/** Virtual tooth id for a piece sitting on an unlabelled region of a free-mode model. */
export const FREE_TOOTH = "X0";

/* ----------------------------------------------------------------- teeth */

export type ToothKey = "central" | "lateral" | "canine" | "pm1" | "pm2" | "m1" | "m2";

export interface ToothSpec {
  wHalf: number;
  hHalf: number;
  dHalf: number;
  /** Superellipse exponent of the crown's cross-section. */
  p: number;
  cervical: number;
  incisal?: number;
  tip?: number;
  labial?: number;
  /** Labial tilt, in degrees. */
  procline: number;
}

/** Upper arch, midline → distal, with full mesiodistal crown widths in millimetres. */
export const QUADRANT_TEETH: { key: ToothKey; fdiR: string; fdiL: string; w: number }[] = [
  { key: "central", fdiR: "11", fdiL: "21", w: 8.5 },
  { key: "lateral", fdiR: "12", fdiL: "22", w: 6.5 },
  { key: "canine", fdiR: "13", fdiL: "23", w: 7.6 },
  { key: "pm1", fdiR: "14", fdiL: "24", w: 6.9 },
  { key: "pm2", fdiR: "15", fdiL: "25", w: 6.9 },
  { key: "m1", fdiR: "16", fdiL: "26", w: 10.2 },
  { key: "m2", fdiR: "17", fdiL: "27", w: 9.8 },
];

export const TOOTH_SPECS: Record<ToothKey, ToothSpec> = {
  central: { wHalf: 4.25, hHalf: 5.3, dHalf: 3.05, p: 6, cervical: 0.24, incisal: 0.66, labial: 0.1, procline: 7 },
  lateral: { wHalf: 3.25, hHalf: 5.05, dHalf: 2.75, p: 6, cervical: 0.26, incisal: 0.6, labial: 0.1, procline: 5 },
  canine: { wHalf: 3.55, hHalf: 5.6, dHalf: 3.15, p: 4.6, cervical: 0.3, tip: 0.62, labial: 0.12, procline: 2 },
  pm1: { wHalf: 3.35, hHalf: 4.7, dHalf: 3.3, p: 5, cervical: 0.2, procline: 0 },
  pm2: { wHalf: 3.3, hHalf: 4.6, dHalf: 3.4, p: 5, cervical: 0.2, procline: 0 },
  m1: { wHalf: 4.9, hHalf: 4.5, dHalf: 4.2, p: 5.5, cervical: 0.16, procline: -2 },
  m2: { wHalf: 4.7, hHalf: 4.3, dHalf: 4.1, p: 5.5, cervical: 0.16, procline: -2 },
};

/** Every tooth of the upper arch, in the order the viewer sees them. */
export const ALL_TEETH = ["17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27"];

/**
 * Translation keys describing a tooth. `short` is the tooth type ("Canine"),
 * `side` the quadrant; the UI assembles them in the customer's language.
 */
export function toothKeys(fdi: string): { tooth: ToothKey; side: "right" | "left" } | null {
  const t = QUADRANT_TEETH.find((q) => q.fdiR === fdi || q.fdiL === fdi);
  if (!t) return null;
  return { tooth: t.key, side: fdi[0] === "1" ? "right" : "left" };
}

/* --------------------------------------------------------------- catalog */

export type FinishId = "clear" | "diamond" | "rose" | "sapphire" | "ruby" | "emerald" | "gold" | "silver";

export interface FinishDef {
  color: string;
  kind: "crystal" | "metal";
  dispersion: number;
  /** CSS background of the finish's swatch. */
  swatch: string;
}

export const FINISHES: Record<FinishId, FinishDef> = {
  clear: { color: "#ffffff", kind: "crystal", dispersion: 0.12, swatch: "radial-gradient(circle at 35% 30%, #ffffff, #dfe9ee 60%, #b9c9d4)" },
  diamond: { color: "#eef6ff", kind: "crystal", dispersion: 0.3, swatch: "radial-gradient(circle at 35% 30%, #f4fbff, #cfe4f5 55%, #9fc3de)" },
  rose: { color: "#ff9dc0", kind: "crystal", dispersion: 0.12, swatch: "radial-gradient(circle at 35% 30%, #ffd3e2, #ff9dc0 60%, #e0719b)" },
  sapphire: { color: "#4d7cff", kind: "crystal", dispersion: 0.12, swatch: "radial-gradient(circle at 35% 30%, #9db9ff, #4d7cff 65%, #2c53c9)" },
  ruby: { color: "#ff2e55", kind: "crystal", dispersion: 0.12, swatch: "radial-gradient(circle at 35% 30%, #ff9bb0, #ff2e55 65%, #c90f34)" },
  emerald: { color: "#22c47c", kind: "crystal", dispersion: 0.12, swatch: "radial-gradient(circle at 35% 30%, #8fe8bd, #22c47c 65%, #0d9159)" },
  gold: { color: "#f6c05a", kind: "metal", dispersion: 0, swatch: "linear-gradient(135deg, #ffe3a0, #f0b34e 55%, #c8872c)" },
  silver: { color: "#e9edf4", kind: "metal", dispersion: 0, swatch: "linear-gradient(135deg, #ffffff, #ccd3dc 55%, #97a2b0)" },
};

export const FINISH_IDS = Object.keys(FINISHES) as FinishId[];

export function isFinishId(value: string): value is FinishId {
  return value in FINISHES;
}

export type JewelryCategory = "crystals" | "shapes" | "precious";
export const JEWELRY_CATEGORIES: JewelryCategory[] = ["crystals", "shapes", "precious"];

export type JewelryGeometry =
  | "round"
  | "diamond"
  | "square"
  | "dot"
  | "star"
  | "heart"
  | "triangle"
  | "drop"
  | "navette"
  | "baguette"
  | "butterfly"
  | "moon"
  | "bolt"
  | "blossom";

export interface JewelryTypeDef {
  id: string;
  category: JewelryCategory;
  geometry: JewelryGeometry;
  defaultScale: number;
  defaultColor: FinishId;
}

/** The library. Names are translated under `studio.editor.pieces.<id>`. */
export const CATALOG: JewelryTypeDef[] = [
  { id: "crystal-round", category: "crystals", geometry: "round", defaultScale: 0.95, defaultColor: "clear" },
  { id: "crystal-diamond", category: "crystals", geometry: "diamond", defaultScale: 1.0, defaultColor: "clear" },
  { id: "crystal-square", category: "crystals", geometry: "square", defaultScale: 0.95, defaultColor: "clear" },
  { id: "crystal-petite", category: "crystals", geometry: "round", defaultScale: 0.55, defaultColor: "clear" },
  { id: "crystal-grand", category: "crystals", geometry: "round", defaultScale: 1.4, defaultColor: "clear" },
  { id: "shape-star", category: "shapes", geometry: "star", defaultScale: 0.85, defaultColor: "clear" },
  { id: "shape-heart", category: "shapes", geometry: "heart", defaultScale: 0.8, defaultColor: "ruby" },
  { id: "shape-triangle", category: "shapes", geometry: "triangle", defaultScale: 0.8, defaultColor: "clear" },
  { id: "shape-drop", category: "shapes", geometry: "drop", defaultScale: 0.85, defaultColor: "clear" },
  { id: "shape-navette", category: "shapes", geometry: "navette", defaultScale: 0.9, defaultColor: "clear" },
  { id: "shape-baguette", category: "shapes", geometry: "baguette", defaultScale: 0.85, defaultColor: "clear" },
  { id: "shape-butterfly", category: "shapes", geometry: "butterfly", defaultScale: 0.85, defaultColor: "gold" },
  { id: "shape-moon", category: "shapes", geometry: "moon", defaultScale: 0.85, defaultColor: "clear" },
  { id: "shape-bolt", category: "shapes", geometry: "bolt", defaultScale: 0.8, defaultColor: "sapphire" },
  { id: "shape-blossom", category: "shapes", geometry: "blossom", defaultScale: 0.85, defaultColor: "rose" },
  { id: "metal-gold-dot", category: "precious", geometry: "dot", defaultScale: 0.9, defaultColor: "gold" },
  { id: "metal-gold-star", category: "precious", geometry: "star", defaultScale: 0.85, defaultColor: "gold" },
  { id: "metal-gold-heart", category: "precious", geometry: "heart", defaultScale: 0.8, defaultColor: "gold" },
  { id: "metal-silver", category: "precious", geometry: "diamond", defaultScale: 1.0, defaultColor: "silver" },
];

export const JEWELRY_BY_ID: Record<string, JewelryTypeDef> = Object.fromEntries(CATALOG.map((t) => [t.id, t]));

/* ---------------------------------------------------------------- limits */

/** Slider ranges, shared by the inspector and the validation of restored designs. */
export const SCALE_RANGE = { min: 0.25, max: 1.8, step: 0.05 } as const;
export const OFFSET_RANGE = { min: -0.5, max: 1.5, step: 0.05 } as const;

/* --------------------------------------------------------------- presets */

export interface PresetItem {
  type: string;
  tooth: string;
  /** -1..1 across the labial face. */
  u?: number;
  /** -1..1 up the labial face. */
  v?: number;
  finish?: FinishId;
  scale?: number;
  rot?: number;
}

/** Ready-made designs. Names and descriptions under `studio.editor.presets.<id>`. */
export const PRESETS: { id: string; items: PresetItem[] }[] = [
  { id: "minimal", items: [{ type: "crystal-petite", tooth: "11", u: 0.05, v: -0.05, finish: "clear", scale: 0.75 }] },
  {
    id: "symmetry",
    items: [
      { type: "crystal-round", tooth: "11", u: 0, v: 0, finish: "clear", scale: 0.85 },
      { type: "crystal-round", tooth: "21", u: 0, v: 0, finish: "clear", scale: 0.85 },
    ],
  },
  {
    id: "glam",
    items: [
      { type: "crystal-petite", tooth: "12", u: 0.1, v: 0, finish: "rose", scale: 0.6 },
      { type: "crystal-round", tooth: "11", u: -0.05, v: 0.05, finish: "clear", scale: 0.95 },
      { type: "crystal-round", tooth: "21", u: -0.05, v: 0.05, finish: "clear", scale: 0.95 },
      { type: "crystal-petite", tooth: "22", u: 0.1, v: 0, finish: "rose", scale: 0.6 },
      { type: "crystal-diamond", tooth: "13", u: 0, v: 0, finish: "sapphire", scale: 0.55 },
      { type: "crystal-diamond", tooth: "23", u: 0, v: 0, finish: "sapphire", scale: 0.55 },
    ],
  },
  {
    id: "papillon",
    items: [
      { type: "shape-butterfly", tooth: "21", u: 0, v: 0.05, finish: "gold", scale: 0.9 },
      { type: "crystal-petite", tooth: "11", u: 0.15, v: -0.25, finish: "clear", scale: 0.5 },
      { type: "shape-heart", tooth: "22", u: -0.05, v: 0.1, finish: "ruby", scale: 0.5 },
      { type: "shape-star", tooth: "12", u: 0, v: -0.1, finish: "silver", scale: 0.5 },
      { type: "crystal-petite", tooth: "13", u: 0, v: 0.05, finish: "clear", scale: 0.5 },
    ],
  },
];

/* ------------------------------------------------------------ estimate */

/**
 * INDICATIVE price list for the design estimate.
 *
 * Prototype values carried over from the standalone Studio, in integer minor
 * units (cents) with an explicit currency, never floats. The estimate is a
 * conversation aid for the artist and the client: it is not a catalogue price,
 * it is never sent to checkout and nothing is charged from it. When the Studio
 * is wired to the catalogue, these come from the products' own prices.
 */
export const ESTIMATE_PRICING = {
  currency: "EUR",
  /** Price of one piece, per type, in cents. */
  baseCents: {
    "crystal-round": 2500,
    "crystal-diamond": 2800,
    "crystal-square": 2600,
    "crystal-petite": 1800,
    "crystal-grand": 3500,
    "shape-star": 2600,
    "shape-heart": 2600,
    "shape-triangle": 2400,
    "shape-drop": 2400,
    "shape-navette": 2600,
    "shape-baguette": 2600,
    "shape-butterfly": 3400,
    "shape-moon": 2600,
    "shape-bolt": 2600,
    "shape-blossom": 2800,
    "metal-gold-dot": 3200,
    "metal-gold-star": 3800,
    "metal-gold-heart": 3800,
    "metal-silver": 3000,
  } as Record<string, number>,
  /** Used for a type missing from `baseCents`. */
  fallbackCents: 2000,
  /** Multiplier by the piece's diameter in millimetres (upper bound inclusive). */
  sizeBands: [
    { upToMm: 1.4, factor: 0.85 },
    { upToMm: 2.2, factor: 1.0 },
    { upToMm: 3.0, factor: 1.35 },
    { upToMm: Number.POSITIVE_INFINITY, factor: 1.7 },
  ],
} as const;

/** Estimated price of one piece, in whole-euro cents. */
export function estimateCents(j: Pick<PlacedJewelry, "jewelryTypeId" | "scale">): number {
  const base = ESTIMATE_PRICING.baseCents[j.jewelryTypeId] ?? ESTIMATE_PRICING.fallbackCents;
  const diameter = j.scale * 2;
  const band = ESTIMATE_PRICING.sizeBands.find((b) => diameter <= b.upToMm) ?? ESTIMATE_PRICING.sizeBands[ESTIMATE_PRICING.sizeBands.length - 1];
  // Rounded to the whole euro, as the price list is expressed in euros.
  return Math.round((base * band.factor) / 100) * 100;
}

export function estimateTotalCents(jewels: PlacedJewelry[]): number {
  return jewels.reduce((sum, j) => sum + estimateCents(j), 0);
}

/* ----------------------------------------------------------- validation */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec = (v: unknown): v is Vec3 =>
  !!v && typeof v === "object" && isNum((v as Vec3).x) && isNum((v as Vec3).y) && isNum((v as Vec3).z);
const HEX_RE = /^#[0-9a-f]{6}$/i;
const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * A design read back from browser storage is untrusted: it may be stale, from
 * an older version, or edited by hand. Keep only well-formed pieces, with
 * values clamped to what the editor itself could have produced.
 */
export function sanitizeJewels(input: unknown): PlacedJewelry[] {
  if (!Array.isArray(input)) return [];
  const out: PlacedJewelry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const j = raw as Record<string, unknown>;
    if (typeof j.id !== "string" || typeof j.jewelryTypeId !== "string" || typeof j.toothId !== "string") continue;
    if (!JEWELRY_BY_ID[j.jewelryTypeId]) continue;
    if (!ALL_TEETH.includes(j.toothId) && j.toothId !== FREE_TOOTH) continue;
    if (!isVec(j.position) || !isVec(j.normal)) continue;
    const color = typeof j.color === "string" && isFinishId(j.color) ? j.color : JEWELRY_BY_ID[j.jewelryTypeId].defaultColor;
    out.push({
      id: j.id.slice(0, 40),
      jewelryTypeId: j.jewelryTypeId,
      toothId: j.toothId,
      position: { x: j.position.x, y: j.position.y, z: j.position.z },
      normal: { x: j.normal.x, y: j.normal.y, z: j.normal.z },
      rotation: isNum(j.rotation) ? ((j.rotation % 360) + 360) % 360 : 0,
      scale: isNum(j.scale) ? clampTo(j.scale, SCALE_RANGE.min, SCALE_RANGE.max) : JEWELRY_BY_ID[j.jewelryTypeId].defaultScale,
      color,
      ...(typeof j.customColor === "string" && HEX_RE.test(j.customColor) ? { customColor: j.customColor.toLowerCase() } : {}),
      ...(isNum(j.offset) ? { offset: clampTo(j.offset, OFFSET_RANGE.min, OFFSET_RANGE.max) } : {}),
    });
  }
  return out;
}
