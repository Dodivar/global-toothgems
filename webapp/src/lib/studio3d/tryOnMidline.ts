/**
 * The midline read from the photo's pixels (2026-11-05), to arbitrate when
 * the two readings of the analysis disagree: the teeth the function found
 * (their 11 / 21) and the photo check's central incisors box.
 *
 * Each can be wrong. On the trial of 2026-11-05, the teeth were a whole tooth
 * off on one photo (the box right), and the box was half a tooth off on
 * another (the teeth right) — whose five renders the midline check then
 * refused. A third source, independent of the image models: the gaps between
 * the upper teeth, darker than the teeth around them. On the 11 distinct
 * analyses of that trial, the darkest gap near the two readings was the real
 * midline every time, within 0.03 central incisor widths.
 *
 * Caution: these were photos of one or two people with a marked gap between
 * the central incisors. Someone whose central incisors touch tightly may have
 * a darker gap elsewhere, so the gap is used only when the two readings
 * disagree (or a reading contradicts itself), only when it clearly stands out
 * from the gaps around it, and the result goes through the usual checks of
 * `registerDesign()`. Behind a flag (`tryOnArbiterEnabled()`, TryOnDialog):
 * off, it is only measured for the analytics.
 *
 * The same gaps also give each tooth's place (`segmentTeeth`): the teeth
 * model's boxes sit on a near-even grid, while real teeth have steady
 * proportions from the midline out (`UPPER_EDGES`, `LOWER_EDGES`).
 *
 * Coordinates: pixels of the close-up, y down. Pure: no React, no DOM.
 */

import type { CloseUpBox, FoundTooth, Registration } from "./tryOnRegistration";

/** RGBA pixels of the close-up, row by row, at the close-up's size. */
export interface CloseUpPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** A dark gap between two upper teeth: its column, and how much darker than around it (0–255). */
export interface ToothGap {
  x: number;
  strength: number;
}

/** What the arbitration found and did. */
export interface MidlineArbitration {
  /** Whether the readings disagreed (or one contradicted itself), so the gap was looked for. */
  triggered: boolean;
  /** The gap taken as the midline, close-up x; null when none stood out (the readings are then left as they were). */
  midline: number | null;
  /** The function's 11/21 midline minus the gap's, in central incisor widths, before any correction. */
  teethOffset: number | null;
  /** The photo check box's centre minus the gap's, in central incisor widths. */
  centralsOffset: number | null;
  /** What was changed in the reading. */
  corrections: MidlineCorrection[];
  /** Upper teeth whose box edges were moved onto gaps (when the boxes could not be rebuilt). */
  snapped: number;
  /** Boxes rebuilt from the gaps (`segmentTeeth`), per arch. */
  segmented: { upper: number; lower: number };
  /** The lower arch's midline gap, close-up x; null when not found. */
  lowerMidline: number | null;
  /** The reading to place the gems on: corrected, or the function's as it was. */
  found: FoundTooth[];
  /** The central incisors box to check the midline against: centred on the gap, or the check's as it was. */
  centrals: CloseUpBox | null;
}

export type MidlineCorrection =
  /** The 1x and 2x (3x and 4x) teeth were named the wrong way round. */
  | "mirrored"
  /** The whole upper numbering was a tooth off. */
  | "shifted"
  /** One side of the upper arch was a tooth off (11 and 21 did not touch: a tooth between them was missed). */
  | "half_shifted";

/** Rows of the central incisors read for the gaps, as shares of their height from the top of their boxes. */
const BAND: readonly [number, number] = [0.35, 0.8];
/** A column's brightness: this percentile of its rows (a gap darkens part of the band only). */
const COLUMN_PERCENTILE = 0.3;
/** Smoothing of the column profile, px. */
const SMOOTH = 5;
/** "Around": the mean brightness over this many central incisor widths. */
const SURROUND = 0.6;
/** A gap is the darkest column within this many central incisor widths on each side... */
const PEAK_SPACING = 0.15;
/** ...and at least this much darker than around it (0–255). */
const MIN_STRENGTH = 4;
/** The lower teeth's band: from the upper central incisors' edge down, these shares of the way to the lower teeth's bottom left out at each end. */
const LOWER_BAND: readonly [number, number] = [0.1, 0.15];
/** The lower teeth are narrower: a narrower surround and spacing (central incisor widths). */
const LOWER_SURROUND = 0.4;
const LOWER_PEAK_SPACING = 0.1;
/** Gaps a rebuilt box ends on: at least this share as strong as the arch's midline gap... */
const SEGMENT_STRENGTH = 0.2;
/** ...within this share of the expected tooth width from where it should be. */
const SEGMENT_STEP_TOLERANCE = 0.3;
/** The central incisors' outer edges are looked for this many (model's) central widths from the midline... */
const FIRST_EDGE_RANGE: readonly [number, number] = [0.55, 1.6];
/** ...and must be this alike on both sides (share of their mean distance). */
const EDGE_SYMMETRY = 0.15;
/** Of those pairs, the innermost at least this share as strong as the strongest. */
const PAIR_STRENGTH = 0.6;
/** The lower midline gap is the one nearest the upper midline within this many central incisor widths. */
const LOWER_MIDLINE_REACH = 0.45;
/**
 * Readings that agree with each other are rebuilt from the gaps when the midline
 * gap is this close to their 11/21 (central widths): less than a tooth, which
 * would need renaming (both readings were 0.4 off on a trial photo).
 */
const AGREE = 0.6;
/** The midline gap is looked for within this many central incisor widths of either reading. */
const SEARCH = 1.3;
/** It stands out when this many times as strong as the next gap there. */
const DOMINANCE = 1.3;
/** The readings disagree from this distance between their midlines, central incisor widths. */
const DISAGREE = 0.25;
/** A whole-arch numbering is a tooth off when its midline is this far from the gap (central incisor widths). */
const SHIFT_RANGE: readonly [number, number] = [0.65, 1.4];
/** 11 and 21 do not touch when this far apart (central incisor widths): a tooth was missed between them. */
const HOLE = 0.4;
/** Box edges are moved onto gaps at least this share as strong as the midline's... */
const SNAP_STRENGTH = 0.25;
/** ...within this many central incisor widths of the edge. */
const SNAP_REACH = 0.45;

/**
 * After renaming the reading, its fitted midline must land this close to the
 * gap (central incisor widths), not just within `MIDLINE_TOLERANCE`: renamed
 * teeth whose fit still misses the gap are not trusted (on the trial, a
 * renamed reading at 0.42 put two of six gems a tooth off).
 */
export const CORRECTED_MIDLINE_TOLERANCE = 0.3;

const UPPER_ROW = ["16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26"];
const isUpper = (t: FoundTooth) => t.fdi[0] === "1" || t.fdi[0] === "2";
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The upper teeth's central incisors' width, px: the mean of 11 and 21, else the median upper tooth's. */
function centralWidth(upper: readonly FoundTooth[]): number {
  const c = upper.filter((t) => t.fdi === "11" || t.fdi === "21");
  return c.length ? c.reduce((s, t) => s + t.width, 0) / c.length : median(upper.map((t) => t.width)) * 1.2;
}

/**
 * The dark gaps along rows `y0`–`y1`, columns `x0`–`x1`: each column's
 * brightness (`COLUMN_PERCENTILE` of its rows) against the mean over
 * `surround` px around it; a gap is the darkest column within `spacing` px.
 */
function gapsAlong(pixels: CloseUpPixels, box: { x0: number; x1: number; y0: number; y1: number }, surround: number, spacing: number): ToothGap[] {
  const x0 = Math.max(0, Math.floor(box.x0));
  const x1 = Math.min(pixels.width, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.round(box.y0));
  const y1 = Math.min(pixels.height, Math.round(box.y1));
  if (y1 - y0 < 3 || x1 - x0 < 10) return [];
  const columns = x1 - x0;
  const raw = new Float64Array(columns);
  const values: number[] = [];
  for (let c = 0; c < columns; c++) {
    values.length = 0;
    for (let y = y0; y < y1; y++) {
      const i = (y * pixels.width + x0 + c) * 4;
      values.push((pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3);
    }
    values.sort((a, b) => a - b);
    raw[c] = values[Math.min(values.length - 1, Math.floor(COLUMN_PERCENTILE * values.length))];
  }
  const mean = (src: Float64Array, size: number) => {
    const half = Math.floor(size / 2);
    const out = new Float64Array(src.length);
    for (let c = 0; c < src.length; c++) {
      let sum = 0;
      for (let k = c - half; k <= c + half; k++) sum += k < 0 || k >= src.length ? 0 : src[k];
      out[c] = sum / size; // zero beyond the ends, as the trial's prototype did: the ends are not read
    }
    return out;
  };
  const profile = mean(raw, SMOOTH);
  const around = mean(profile, Math.max(9, Math.round(surround) | 1));
  const score = profile.map((v, c) => around[c] - v);
  const reach = Math.max(3, Math.round(spacing));
  const gaps: ToothGap[] = [];
  for (let c = 3; c < columns - 3; c++) {
    if (score[c] <= MIN_STRENGTH) continue;
    let peak = true;
    for (let k = Math.max(0, c - reach); k <= Math.min(columns - 1, c + reach) && peak; k++) if (score[k] > score[c]) peak = false;
    if (peak && (gaps.length === 0 || gaps[gaps.length - 1].x !== x0 + c - 1)) gaps.push({ x: x0 + c, strength: Math.round(score[c] * 10) / 10 });
  }
  return gaps;
}

/**
 * The dark gaps between the upper teeth, from the image's left: along the
 * band of the central incisors' crowns. Empty without upper teeth.
 */
export function toothGaps(pixels: CloseUpPixels, found: readonly FoundTooth[]): ToothGap[] {
  const upper = found.filter(isUpper).filter((t) => t.width > 0 && t.height > 0);
  if (!upper.length) return [];
  const centrals = upper.filter((t) => t.fdi === "11" || t.fdi === "21");
  const rows = centrals.length ? centrals : upper;
  const top = median(rows.map((t) => t.y));
  const height = median(rows.map((t) => t.height));
  const w = centralWidth(upper);
  const x0 = Math.min(...upper.map((t) => t.x));
  const x1 = Math.max(...upper.map((t) => t.x + t.width));
  return gapsAlong(pixels, { x0, x1, y0: top + BAND[0] * height, y1: top + BAND[1] * height }, SURROUND * w, PEAK_SPACING * w);
}

/**
 * The dark gaps between the lower teeth: along the band between the upper
 * central incisors' edge and the bottom of the lower teeth found. Empty
 * without both arches.
 */
export function lowerToothGaps(pixels: CloseUpPixels, found: readonly FoundTooth[]): ToothGap[] {
  const upper = found.filter(isUpper).filter((t) => t.width > 0 && t.height > 0);
  const lower = found.filter((t) => !isUpper(t)).filter((t) => t.width > 0 && t.height > 0);
  const centrals = upper.filter((t) => t.fdi === "11" || t.fdi === "21");
  if (!centrals.length || !lower.length) return [];
  const edge = median(centrals.map((t) => t.y + t.height));
  const bottom = median(lower.map((t) => t.y + t.height));
  if (bottom - edge < 8) return [];
  const w = centralWidth(upper);
  const all = [...upper, ...lower];
  const x0 = Math.min(...all.map((t) => t.x));
  const x1 = Math.max(...all.map((t) => t.x + t.width));
  const y0 = edge + LOWER_BAND[0] * (bottom - edge);
  const y1 = bottom - LOWER_BAND[1] * (bottom - edge);
  return gapsAlong(pixels, { x0, x1, y0, y1 }, LOWER_SURROUND * w, LOWER_PEAK_SPACING * w);
}

/**
 * Where each tooth sits, from the gaps (2026-11-05): from the midline gap,
 * outward, the next gap where a tooth of the usual width ends. The teeth model
 * draws its boxes on a near-even grid — the central incisors too narrow, the
 * lateral ones over the central incisors' outer part — while on the trial's
 * photos the gaps put the upper teeth's outer edges at 1.05, 1.73 and 2.32
 * central incisor widths from the midline and the lower ones' at 0.64, 1.28
 * and 1.88 (to the canines), within about 0.1 from photo to photo.
 */
export const UPPER_EDGES: readonly number[] = [1.05, 1.73, 2.32, 2.8];
export const LOWER_EDGES: readonly number[] = [0.64, 1.28, 1.88, 2.4];

/** The teeth of each side of each arch, from the midline outward; on the image, 1x and 4x are on the left. */
const SIDES = {
  upperRight: ["11", "12", "13", "14"],
  upperLeft: ["21", "22", "23", "24"],
  lowerRight: ["41", "42", "43", "44"],
  lowerLeft: ["31", "32", "33", "34"],
} as const;

/**
 * The gaps from the midline outward along one side, each near where the next
 * tooth of the usual width ends (`first`: the first one, already chosen);
 * stops at the first tooth whose end has no gap.
 */
function walk(gaps: readonly ToothGap[], start: number, dir: 1 | -1, edges: readonly number[], unit: number, first: number | null, minStrength: number): number[] {
  const out: number[] = [];
  let prev = start;
  for (let k = 0; k < edges.length; k++) {
    if (k === 0 && first !== null) {
      out.push(first);
      prev = first;
      continue;
    }
    const step = (edges[k] - (k ? edges[k - 1] : 0)) * unit;
    const expected = prev + dir * step;
    const candidates = gaps.filter((g) => g.strength >= minStrength && Math.abs(g.x - expected) <= SEGMENT_STEP_TOLERANCE * step);
    if (!candidates.length) break;
    prev = candidates.reduce((b, g) => (Math.abs(g.x - expected) < Math.abs(b.x - expected) ? g : b)).x;
    out.push(prev);
  }
  return out;
}

const MIRROR: Record<string, string> = { "1": "2", "2": "1", "3": "4", "4": "3" };

/** The boxes between consecutive gaps of one side, their tops and heights the model's for the same tooth (else its mirror's). */
function sideBoxes(teeth: readonly FoundTooth[], names: readonly string[], start: number, bounds: readonly number[]): FoundTooth[] {
  const out: FoundTooth[] = [];
  let prev = start;
  bounds.forEach((b, k) => {
    const fdi = names[k];
    const like = teeth.find((t) => t.fdi === fdi) ?? teeth.find((t) => t.fdi === MIRROR[fdi[0]] + fdi[1]);
    if (like) out.push({ fdi, x: Math.min(prev, b), y: like.y, width: Math.abs(b - prev), height: like.height });
    prev = b;
  });
  return out;
}

/** The result of `segmentTeeth`. */
export interface Segmentation {
  /** The reading, its boxes rebuilt on the gaps where found. */
  found: FoundTooth[];
  /** Boxes rebuilt, per arch. */
  upper: number;
  lower: number;
  /** The lower arch's midline gap, close-up x; null when not found. */
  lowerMidline: number | null;
}

/**
 * The teeth's boxes rebuilt from the gaps (`UPPER_EDGES`): the upper arch
 * from `midline`, the lower one from its own midline gap near it. Only from
 * the central incisors' outer edges found alike on both sides; a box the model
 * drew where a rebuilt one now is, for another tooth, is dropped. `w`: the
 * central incisors' width the model drew, px.
 */
export function segmentTeeth(found: readonly FoundTooth[], midline: ToothGap, w: number, upperGaps: readonly ToothGap[], lowerGaps: readonly ToothGap[]): Segmentation {
  const none: Segmentation = { found: [...found], upper: 0, lower: 0, lowerMidline: null };
  const min = SEGMENT_STRENGTH * midline.strength;
  const side = (dir: 1 | -1) =>
    upperGaps.filter((g) => {
      const d = dir * (g.x - midline.x);
      return g.strength >= min && d >= FIRST_EDGE_RANGE[0] * w && d <= FIRST_EDGE_RANGE[1] * w;
    });
  // The pairs alike on both sides; the innermost of the strong ones (the next pair out, the lateral
  // incisors' outer edges, is alike too).
  const pairs: { l: ToothGap; r: ToothGap; strength: number; distance: number }[] = [];
  for (const l of side(-1)) {
    for (const r of side(1)) {
      const dl = midline.x - l.x;
      const dr = r.x - midline.x;
      if (Math.abs(dl - dr) <= EDGE_SYMMETRY * ((dl + dr) / 2)) pairs.push({ l, r, strength: l.strength + r.strength, distance: dl + dr });
    }
  }
  if (!pairs.length) return none;
  const strongestPair = Math.max(...pairs.map((p) => p.strength));
  const best = pairs.filter((p) => p.strength >= PAIR_STRENGTH * strongestPair).sort((a, b) => a.distance - b.distance)[0];
  const unit = (best.r.x - best.l.x) / 2 / UPPER_EDGES[0];

  const left = walk(upperGaps, midline.x, -1, UPPER_EDGES, unit, best.l.x, min);
  const right = walk(upperGaps, midline.x, 1, UPPER_EDGES, unit, best.r.x, min);
  const rebuilt = [...sideBoxes(found, SIDES.upperRight, midline.x, left), ...sideBoxes(found, SIDES.upperLeft, midline.x, right)];
  const upper = rebuilt.length;

  // The lower arch: its midline gap, the nearest to the upper one among the strong ones, then the same walk.
  let lowerMidline: number | null = null;
  const around = lowerGaps.filter((g) => Math.abs(g.x - midline.x) <= 1.5 * unit);
  const strongest = Math.max(0, ...around.map((g) => g.strength));
  const centre = around
    .filter((g) => Math.abs(g.x - midline.x) <= LOWER_MIDLINE_REACH * unit && g.strength >= 0.5 * strongest)
    .sort((a, b) => Math.abs(a.x - midline.x) - Math.abs(b.x - midline.x))[0];
  if (centre) {
    lowerMidline = centre.x;
    const lmin = SEGMENT_STRENGTH * centre.strength;
    const ll = walk(lowerGaps, centre.x, -1, LOWER_EDGES, unit, null, lmin);
    const lr = walk(lowerGaps, centre.x, 1, LOWER_EDGES, unit, null, lmin);
    rebuilt.push(...sideBoxes(found, SIDES.lowerRight, centre.x, ll), ...sideBoxes(found, SIDES.lowerLeft, centre.x, lr));
  }
  if (!rebuilt.length) return none;

  const names = new Set(rebuilt.map((t) => t.fdi));
  const kept = found.filter((t) => {
    if (names.has(t.fdi)) return false;
    const c = t.x + t.width / 2;
    return !rebuilt.some((r) => isUpper(r) === isUpper(t) && c >= r.x && c <= r.x + r.width);
  });
  return { found: [...kept, ...rebuilt], upper, lower: rebuilt.length - upper, lowerMidline };
}

/** The found teeth with the upper numbers moved `shift` places along the arch (positive: toward the image's right), for the teeth `which` picks; off the arch, dropped. */
function renameUpper(found: readonly FoundTooth[], shift: number, which: (t: FoundTooth) => boolean): FoundTooth[] {
  return found.flatMap((t) => {
    const i = UPPER_ROW.indexOf(t.fdi);
    if (i < 0 || !which(t)) return [t];
    const fdi = UPPER_ROW[i + shift];
    return fdi ? [{ ...t, fdi }] : [];
  });
}

/**
 * Arbitrate the analysis' two midlines with the gaps (see the module
 * comment). Returns the reading to place the gems on and the central incisors
 * box to check them against; both as given when the readings agree or no gap
 * stands out.
 */
export function arbitrateMidline(
  found: readonly FoundTooth[],
  centrals: CloseUpBox | null,
  gaps: readonly ToothGap[],
  lowerGaps: readonly ToothGap[] = [],
): MidlineArbitration {
  const unchanged: MidlineArbitration = {
    triggered: false,
    midline: null,
    teethOffset: null,
    centralsOffset: null,
    corrections: [],
    snapped: 0,
    segmented: { upper: 0, lower: 0 },
    lowerMidline: null,
    found: [...found],
    centrals,
  };
  let teeth = [...found];
  const corrections: MidlineCorrection[] = [];

  // Named the wrong way round: every 2x left of every 1x on the image.
  const q1 = teeth.filter((t) => t.fdi[0] === "1");
  const q2 = teeth.filter((t) => t.fdi[0] === "2");
  if (q1.length && q2.length && Math.max(...q2.map((t) => t.x + t.width / 2)) < Math.min(...q1.map((t) => t.x + t.width / 2))) {
    const swap: Record<string, string> = { "1": "2", "2": "1", "3": "4", "4": "3" };
    teeth = teeth.map((t) => ({ ...t, fdi: (swap[t.fdi[0]] ?? t.fdi[0]) + t.fdi.slice(1) }));
    corrections.push("mirrored");
  }

  const t11 = teeth.find((t) => t.fdi === "11");
  const t21 = teeth.find((t) => t.fdi === "21");
  if (!t11 || !t21) return unchanged;
  const w = (t11.width + t21.width) / 2;
  if (!(w > 0)) return unchanged;
  const teethMid = (t11.x + t11.width + t21.x) / 2;
  const hole = t21.x - (t11.x + t11.width);
  const centralsMid = centrals && centrals.width > 0 ? centrals.x + centrals.width / 2 : null;
  const triggered =
    corrections.length > 0 || hole > HOLE * w || centralsMid === null || Math.abs(teethMid - centralsMid) > DISAGREE * w;
  const near = gaps
    .filter((g) => Math.abs(g.x - teethMid) <= SEARCH * w || (centralsMid !== null && Math.abs(g.x - centralsMid) <= SEARCH * w))
    .sort((a, b) => b.strength - a.strength);
  const clear = near.length > 0 && (near.length === 1 || near[0].strength >= DOMINANCE * near[1].strength);
  const round = (n: number) => Math.round(n * 100) / 100;
  // Readings that agree are kept as named; their boxes are rebuilt only on a gap that agrees with them too.
  if (!clear) return { ...unchanged, triggered };
  const gap = near[0];
  const teethOffset = (teethMid - gap.x) / w;
  if (!triggered && Math.abs(teethOffset) > AGREE) return unchanged;

  if (triggered && hole > HOLE * w) {
    // A tooth missed between 11 and 21: the side whose inner edge is far from the gap is a tooth off.
    const leftFar = Math.abs(t11.x + t11.width - gap.x) > Math.abs(t21.x - gap.x);
    teeth = leftFar ? renameUpper(teeth, -1, (t) => t.fdi[0] === "1") : renameUpper(teeth, 1, (t) => t.fdi[0] === "2");
    corrections.push("half_shifted");
  } else if (triggered && Math.abs(teethOffset) >= SHIFT_RANGE[0] && Math.abs(teethOffset) <= SHIFT_RANGE[1]) {
    teeth = renameUpper(teeth, teethOffset > 0 ? 1 : -1, () => true);
    corrections.push("shifted");
  }

  // Each tooth's box rebuilt from the gaps where they can be followed (`segmentTeeth`)...
  const segmentation = segmentTeeth(teeth, gap, w, gaps, lowerGaps);
  teeth = segmentation.found;
  const rebuilt = new Set(segmentation.upper ? teeth.filter(isUpper).map((t) => t.fdi) : []);
  // ...else (the reading disagreed) the upper boxes' edges onto the gaps near them.
  const strong = gaps.filter((g) => g.strength >= SNAP_STRENGTH * gap.strength);
  let snapped = 0;
  teeth = teeth.map((t) => {
    if (!isUpper(t) || !triggered || rebuilt.size) return t;
    const nearest = (x: number) => strong.reduce((b, g) => (Math.abs(g.x - x) < Math.abs(b.x - x) ? g : b), strong[0]).x;
    const l = nearest(t.x);
    const r = nearest(t.x + t.width);
    const left = Math.abs(l - t.x) <= SNAP_REACH * w ? l : t.x;
    const right = Math.abs(r - (t.x + t.width)) <= SNAP_REACH * w ? r : t.x + t.width;
    if (right - left <= 0.3 * w || (left === t.x && right === t.x + t.width)) return t;
    snapped++;
    return { ...t, x: left, width: right - left };
  });

  const box = centrals ?? { y: t11.y, height: t11.height };
  return {
    triggered,
    midline: gap.x,
    teethOffset: round(teethOffset),
    centralsOffset: centralsMid === null ? null : round((centralsMid - gap.x) / w),
    corrections,
    snapped,
    segmented: { upper: segmentation.upper, lower: segmentation.lower },
    lowerMidline: segmentation.lowerMidline,
    found: teeth,
    centrals: { x: gap.x - w, y: box.y, width: 2 * w, height: box.height },
  };
}

/** Whether a placement made on the arbitrated reading may be used: reliable, and — the reading renamed — its midline on the gap. */
export function arbitratedReliable(registration: Registration, arbitration: MidlineArbitration): boolean {
  if (!registration.reliable) return false;
  if (arbitration.corrections.length === 0) return true;
  return registration.midlineError !== null && registration.midlineError <= CORRECTED_MIDLINE_TOLERANCE;
}
