/**
 * Reference data for the 3D Studio editor (`/studio-3d/atelier`).
 *
 * Pure data and pure functions only — no three.js, no React — so the piece
 * model and the dentition can be read and tested on their own. The pieces
 * themselves are the shop's gems (`lib/studio3d/gemCatalog.ts`). Every label
 * shown to a customer lives in the `studio.editor` translations or comes from
 * the catalogue; this file only holds identifiers, geometry and numbers.
 */

import { SS_MAX, SS_MIN, stoneSizeMmApprox } from "../lib/gemOptions";

/* ------------------------------------------------------------------ types */

/** A point or direction in the editor's world space (plain, serialisable). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Outline of a piece in the 3D editor. Every shape is drawn procedurally
 * (`lib/studio3d/geometry.ts`); `studio_gem_appearances.shape` holds the same
 * names, and the database check lists the same values.
 */
export type StudioShape =
  | "round"
  | "baguette"
  | "square"
  | "heart"
  | "open-heart"
  | "kite"
  | "navette"
  | "raindrop"
  | "triangle"
  | "rivoli-star"
  | "starflower"
  | "halo-star"
  | "bolt"
  | "cherries"
  | "snake"
  | "dachshund";

export const STUDIO_SHAPES: StudioShape[] = [
  "round",
  "baguette",
  "square",
  "heart",
  "open-heart",
  "kite",
  "navette",
  "raindrop",
  "triangle",
  "rivoli-star",
  "starflower",
  "halo-star",
  "bolt",
  "cherries",
  "snake",
  "dachshund",
];

export type GemMaterial = "crystal" | "metal";
/** `iridescent`: an AB / Shimmer / Vitrail coating, rainbow reflections over the tint. */
export type GemEffect = "none" | "iridescent";

/**
 * How a piece is drawn. Copied onto every placed piece when it is placed, so
 * a design keeps rendering (share links, thumbnails, previews) even when its
 * product later leaves the shop or the catalogue has not loaded yet.
 */
export interface GemLook {
  shape: StudioShape;
  material: GemMaterial;
  /** Tint, lowercase `#rrggbb`. */
  color: string;
  effect: GemEffect;
}

/** One piece placed on the dentition. Serialisable as-is: this is the saved design. */
export interface PlacedJewelry {
  id: string;
  /** The shop product (`products.id`; the slug on the prototype's mock products). */
  productId: string;
  /** The colour variant (yellow / white gold…), when the product has several looks. */
  variantId?: string;
  /** Stone size (SS, `lib/gemOptions.ts`). */
  ss: number;
  look: GemLook;
  /** FDI tooth number, or `FREE_TOOTH` on an unlabelled region of an imported model. */
  toothId: string;
  position: Vec3;
  normal: Vec3;
  /** Spin around the surface normal, in degrees. */
  rotation: number;
  /**
   * Half the piece's longest side, in millimetres — derived from `ss`
   * (`scaleForSs`) and kept on the piece because the engine poses with it.
   */
  scale: number;
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
export const UPPER_TEETH = ["17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27"];
/** Every tooth of the lower arch, in the order the viewer sees them (FDI quadrants 4 and 3). */
export const LOWER_TEETH = ["47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37"];
/** Every tooth a piece can sit on: the default dentition has both arches. */
export const ALL_TEETH = [...UPPER_TEETH, ...LOWER_TEETH];

/** The quadrant of a tooth, as a translation key under `studio.editor.sides`. */
export type ToothSide = "right" | "left" | "lowerRight" | "lowerLeft";
const QUADRANT_SIDES: Record<string, ToothSide> = { "1": "right", "2": "left", "3": "lowerLeft", "4": "lowerRight" };

/**
 * Translation keys describing a tooth. `tooth` is the tooth type ("Canine"),
 * `side` the quadrant; the UI assembles them in the customer's language.
 */
export function toothKeys(fdi: string): { tooth: ToothKey; side: ToothSide } | null {
  const side = QUADRANT_SIDES[fdi[0]];
  const t = fdi.length === 2 ? QUADRANT_TEETH[Number(fdi[1]) - 1] : undefined;
  if (!side || !t) return null;
  return { tooth: t.key, side };
}

export function isLowerTooth(fdi: string): boolean {
  return fdi[0] === "3" || fdi[0] === "4";
}

/* ----------------------------------------------------------------- sizes */

/** Sizes a shop gem is offered in until the team sets its real ones (its `ss` variants). */
export const DEFAULT_STUDIO_SIZES = [2, 5, 7];

/**
 * Half the longest side of a piece of this stone size, in millimetres. SS is
 * the gauge of round stones; a shaped piece is drawn with its longest side
 * equal to that diameter.
 */
export function scaleForSs(ss: number): number {
  return stoneSizeMmApprox(ss) / 2;
}

/* ---------------------------------------------------------------- limits */

export const OFFSET_RANGE = { min: -0.5, max: 1.5, step: 0.05 } as const;

/* ----------------------------------------------------------- validation */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec = (v: unknown): v is Vec3 =>
  !!v && typeof v === "object" && isNum((v as Vec3).x) && isNum((v as Vec3).y) && isNum((v as Vec3).z);
const HEX_RE = /^#[0-9a-f]{6}$/i;
/** A product or variant reference: a uuid, or a mock product's slug. */
const REF_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function isStudioShape(value: unknown): value is StudioShape {
  return typeof value === "string" && (STUDIO_SHAPES as string[]).includes(value);
}

/** A look read back from storage, or null when it is not one the editor could have written. */
export function sanitizeLook(input: unknown): GemLook | null {
  if (!input || typeof input !== "object") return null;
  const l = input as Record<string, unknown>;
  if (!isStudioShape(l.shape) || typeof l.color !== "string" || !HEX_RE.test(l.color)) return null;
  return {
    shape: l.shape,
    material: l.material === "metal" ? "metal" : "crystal",
    color: l.color.toLowerCase(),
    effect: l.effect === "iridescent" ? "iridescent" : "none",
  };
}

/** A stone size read back from storage: a whole SS within the database's bounds. */
export function sanitizeSs(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= SS_MIN && value <= SS_MAX ? value : null;
}

/** A product / variant reference read back from storage. */
export function isGemRef(value: unknown): value is string {
  return typeof value === "string" && REF_RE.test(value);
}

/**
 * A design read back from browser storage or the database is untrusted: it
 * may be stale, from an older version, or edited by hand. Keep only
 * well-formed pieces, with values clamped to what the editor itself could
 * have produced.
 *
 * Deliberately structural: a piece is NOT checked against the shop's
 * catalogue, which loads later than a draft is read and which a product may
 * leave. Its look travels with it, so it still renders; the panels say when
 * its product is no longer sold.
 */
export function sanitizeJewels(input: unknown): PlacedJewelry[] {
  if (!Array.isArray(input)) return [];
  const out: PlacedJewelry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const j = raw as Record<string, unknown>;
    if (typeof j.id !== "string" || !isGemRef(j.productId) || typeof j.toothId !== "string") continue;
    if (!ALL_TEETH.includes(j.toothId) && j.toothId !== FREE_TOOTH) continue;
    if (!isVec(j.position) || !isVec(j.normal)) continue;
    const look = sanitizeLook(j.look);
    const ss = sanitizeSs(j.ss);
    if (!look || ss === null) continue;
    out.push({
      id: j.id.slice(0, 40),
      productId: j.productId,
      ...(isGemRef(j.variantId) ? { variantId: j.variantId } : {}),
      ss,
      look,
      toothId: j.toothId,
      position: { x: j.position.x, y: j.position.y, z: j.position.z },
      normal: { x: j.normal.x, y: j.normal.y, z: j.normal.z },
      rotation: isNum(j.rotation) ? ((j.rotation % 360) + 360) % 360 : 0,
      scale: scaleForSs(ss),
      ...(isNum(j.offset) ? { offset: clampTo(j.offset, OFFSET_RANGE.min, OFFSET_RANGE.max) } : {}),
    });
  }
  return out;
}
