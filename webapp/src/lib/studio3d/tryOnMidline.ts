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
  /** Upper teeth whose box edges were moved onto gaps. */
  snapped: number;
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
 * The dark gaps between the upper teeth, from the image's left: along the
 * band of the central incisors' crowns, each column's brightness against the
 * mean around it. Empty without upper teeth.
 */
export function toothGaps(pixels: CloseUpPixels, found: readonly FoundTooth[]): ToothGap[] {
  const upper = found.filter(isUpper).filter((t) => t.width > 0 && t.height > 0);
  if (!upper.length) return [];
  const centrals = upper.filter((t) => t.fdi === "11" || t.fdi === "21");
  const rows = centrals.length ? centrals : upper;
  const top = median(rows.map((t) => t.y));
  const height = median(rows.map((t) => t.height));
  const y0 = Math.max(0, Math.round(top + BAND[0] * height));
  const y1 = Math.min(pixels.height, Math.round(top + BAND[1] * height));
  const x0 = Math.max(0, Math.floor(Math.min(...upper.map((t) => t.x))));
  const x1 = Math.min(pixels.width, Math.ceil(Math.max(...upper.map((t) => t.x + t.width))));
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
      let s = 0;
      for (let k = c - half; k <= c + half; k++) s += k < 0 || k >= src.length ? 0 : src[k];
      out[c] = s / size; // zero beyond the ends, as the trial's prototype did: the ends are not read
    }
    return out;
  };
  const w = centralWidth(upper);
  const profile = mean(raw, SMOOTH);
  const around = mean(profile, Math.max(9, Math.round(SURROUND * w) | 1));
  const score = profile.map((v, c) => around[c] - v);
  const spacing = Math.max(3, Math.round(PEAK_SPACING * w));

  const gaps: ToothGap[] = [];
  for (let c = 3; c < columns - 3; c++) {
    if (score[c] <= MIN_STRENGTH) continue;
    let peak = true;
    for (let k = Math.max(0, c - spacing); k <= Math.min(columns - 1, c + spacing) && peak; k++) if (score[k] > score[c]) peak = false;
    if (peak && (gaps.length === 0 || gaps[gaps.length - 1].x !== x0 + c - 1)) gaps.push({ x: x0 + c, strength: Math.round(score[c] * 10) / 10 });
  }
  return gaps;
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
export function arbitrateMidline(found: readonly FoundTooth[], centrals: CloseUpBox | null, gaps: readonly ToothGap[]): MidlineArbitration {
  const unchanged: MidlineArbitration = {
    triggered: false,
    midline: null,
    teethOffset: null,
    centralsOffset: null,
    corrections: [],
    snapped: 0,
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
  if (!triggered) return unchanged;

  const near = gaps
    .filter((g) => Math.abs(g.x - teethMid) <= SEARCH * w || (centralsMid !== null && Math.abs(g.x - centralsMid) <= SEARCH * w))
    .sort((a, b) => b.strength - a.strength);
  const clear = near.length > 0 && (near.length === 1 || near[0].strength >= DOMINANCE * near[1].strength);
  const round = (n: number) => Math.round(n * 100) / 100;
  if (!clear) return { ...unchanged, triggered: true };

  const gap = near[0];
  const teethOffset = (teethMid - gap.x) / w;
  if (hole > HOLE * w) {
    // A tooth missed between 11 and 21: the side whose inner edge is far from the gap is a tooth off.
    const leftFar = Math.abs(t11.x + t11.width - gap.x) > Math.abs(t21.x - gap.x);
    teeth = leftFar ? renameUpper(teeth, -1, (t) => t.fdi[0] === "1") : renameUpper(teeth, 1, (t) => t.fdi[0] === "2");
    corrections.push("half_shifted");
  } else if (Math.abs(teethOffset) >= SHIFT_RANGE[0] && Math.abs(teethOffset) <= SHIFT_RANGE[1]) {
    teeth = renameUpper(teeth, teethOffset > 0 ? 1 : -1, () => true);
    corrections.push("shifted");
  }

  // The upper boxes' edges onto the gaps near them.
  const strong = gaps.filter((g) => g.strength >= SNAP_STRENGTH * gap.strength);
  let snapped = 0;
  teeth = teeth.map((t) => {
    if (!isUpper(t)) return t;
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
    triggered: true,
    midline: gap.x,
    teethOffset: round(teethOffset),
    centralsOffset: centralsMid === null ? null : round((centralsMid - gap.x) / w),
    corrections,
    snapped,
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
