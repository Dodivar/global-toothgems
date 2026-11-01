import type { Luma } from "./tryOnAlign";

/**
 * The drift check of the computed try-on (decision 111 (k), step 5): after the
 * image model turned the placement marks into gems, did each gem stay where it
 * was placed, and did the model change the photo elsewhere?
 *
 * Measured on the mouth close-up, the customer's untouched photo against the
 * final result (pasted back and lined up): where a gem was placed, the result
 * must differ from the photo clearly more than just around it; away from the
 * gems, it should barely differ at all. Grey levels only, small enough to run
 * in the browser at once. A first measure, to read with the image itself:
 * it tells staff where to look, it decides nothing.
 *
 * Pure: it takes the pixels (`Luma`, the same size both).
 */

export interface DriftGem {
  id: string;
  /** Centre and half longest side, in the pixels of the pictures compared. */
  x: number;
  y: number;
  r: number;
}

export interface DriftReport {
  /** Gems large enough to be measured. */
  checked: number;
  /** Of those, the ones whose place clearly changed: a gem is there. */
  kept: number;
  /** Measured gems whose place did not change: the model moved or dropped them. */
  missing: string[];
  /** Share of the close-up away from the gems that changed strongly (0–1). */
  stray: number;
  /** No gem missing and little change elsewhere. */
  ok: boolean;
}

/** A gem smaller than this (radius, px) is not measured: too few pixels to tell. */
export const MIN_RADIUS = 2;
/** Grey-level change that marks a gem as there: at least this inside its place… */
const MIN_INSIDE = 12;
/** …and this much more than in the ring around it. */
const MIN_CONTRAST = 8;
/** A pixel away from the gems changed by more than this counts as stray. */
const STRAY_LEVEL = 45;
/** Above this share of stray pixels, the model changed the photo beyond the gems. */
export const STRAY_LIMIT = 0.03;

function meanChange(a: Luma, b: Luma, cx: number, cy: number, r0: number, r1: number): number | null {
  let sum = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor(cx - r1));
  const x1 = Math.min(a.width - 1, Math.ceil(cx + r1));
  const y0 = Math.max(0, Math.floor(cy - r1));
  const y1 = Math.min(a.height - 1, Math.ceil(cy + r1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r0 || d > r1) continue;
      const i = y * a.width + x;
      sum += Math.abs(a.data[i] - b.data[i]);
      n++;
    }
  }
  return n ? sum / n : null;
}

export function driftReport(original: Luma, result: Luma, gems: readonly DriftGem[]): DriftReport {
  if (original.width !== result.width || original.height !== result.height) throw new Error("driftReport: sizes differ");
  const measured = gems.filter((g) => g.r >= MIN_RADIUS);
  const missing: string[] = [];
  for (const g of measured) {
    const inside = meanChange(original, result, g.x, g.y, 0, g.r * 0.8);
    const ring = meanChange(original, result, g.x, g.y, g.r * 1.8, g.r * 2.6) ?? 0;
    if (inside === null || inside < MIN_INSIDE || inside < ring + MIN_CONTRAST) missing.push(g.id);
  }

  // Away from every gem (two radii and a little more) and from the faded edge of the paste.
  const { width, height } = original;
  const edge = Math.round(Math.min(width, height) * 0.06);
  let stray = 0;
  let counted = 0;
  for (let y = edge; y < height - edge; y++) {
    for (let x = edge; x < width - edge; x++) {
      if (gems.some((g) => Math.hypot(x - g.x, y - g.y) < g.r * 2 + 2)) continue;
      const i = y * width + x;
      counted++;
      if (Math.abs(original.data[i] - result.data[i]) > STRAY_LEVEL) stray++;
    }
  }
  const strayShare = counted ? Math.round((stray / counted) * 1000) / 1000 : 0;
  return {
    checked: measured.length,
    kept: measured.length - missing.length,
    missing,
    stray: strayShare,
    ok: missing.length === 0 && strayShare <= STRAY_LIMIT,
  };
}
