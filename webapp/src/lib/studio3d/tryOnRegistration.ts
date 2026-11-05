import type { StudioShape } from "../../data/studioEditor";
import type { FrontViewProjection, FrontViewTooth } from "./frontView";

/**
 * The computed placement of a try-on (decision 111 (k), 2026-11-01): where
 * each gem of a creation goes on the customer's photo, worked out from the
 * teeth found on it — so the image model no longer decides where to draw.
 *
 * Input: the teeth the function found on the mouth close-up, each with its
 * FDI number and box (`teeth.ts` in `studio-try-on`), the box of the two upper
 * central incisors the photo check saw (optional), and the creation's front
 * view (`projectFrontView`): the Studio's reference dentition in real
 * millimetres, every gem at its place and real size on its tooth.
 *
 * 1. The reference dentition is fitted onto the found teeth by one
 *    similarity (scale, turn, shift), on each tooth's biting-edge centre — the
 *    part lips hide least. The reference has its teeth closed; on the photo
 *    the mouth may be open, so the lower arch also gets its own offset down
 *    (`lowerOffset`, 2026-11-04: with a 6 mm opening every lower tooth was set
 *    aside and its gems left out). Teeth that do not agree with the others (a
 *    wrong number, a box on two teeth) are set aside, one at a time, while
 *    three or more remain.
 * 2. The teeth's numbers are questioned (2026-11-04): the teeth model
 *    sometimes numbers a whole arch one tooth off, which the fit alone cannot
 *    see (it stays consistent and moves the design one tooth). Each arch is
 *    also tried one tooth to either side; a numbering is kept or replaced on
 *    how well the teeth agree in place and width (a central incisor is wider
 *    than a lateral one) and with the photo check's central incisors (the
 *    midline, a tie-breaker). Another numbering is taken only when clearly better.
 * 3. Each gem is put on its own tooth: across it, at its share of the found
 *    box's width (the customer's own tooth); up from its biting edge, at its
 *    real distance in millimetres times the fitted scale. A design tooth that
 *    was not found, or was set aside, takes the fitted reference tooth.
 * 4. Its size is physical (owner's decision, 2026-11-01): its real size in
 *    millimetres times the fitted scale — a 2 mm gem stays 2 mm, whatever the
 *    width of the customer's teeth.
 * 5. A gem whose centre falls outside the visible part of its tooth (the
 *    found box: a lip or the upper teeth hide the rest) is `hidden`: never
 *    drawn on a lip or a gum (2026-11-03).
 *
 * A lower tooth whose top is tucked under the upper teeth (the usual
 * overbite) does not show its biting edge: its box starts where the upper
 * teeth end. Its edge is then taken `LOWER_OVERBITE_MM` above the box, so its
 * gems are not pushed down by the overlap (2026-11-03: drops on the lower
 * incisors landed on the lower lip).
 *
 * A confidence (0–1) says how far the result can be trusted; below
 * `RELIABLE_CONFIDENCE` the try-on asks for another photo.
 *
 * Coordinates: pixels of the close-up, y down. Pure: no React, no DOM.
 */

/** A tooth the function found: its FDI number and box, in the close-up's pixels. */
export interface FoundTooth {
  fdi: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A box in the close-up's pixels. */
export interface CloseUpBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A tooth as the placement uses it. */
export interface RegisteredTooth {
  fdi: string;
  lower: boolean;
  /** Box in the close-up's pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * `found`: the function's box, used for the gems; `outlier`: found but set
   * aside (it disagrees with the other teeth); `fitted`: not found, the
   * reference tooth put where the fit expects it (only for teeth carrying gems).
   */
  source: "found" | "outlier" | "fitted";
  /** Distance between where it was found and where the fit expects it, as a share of the tooth's width; null when fitted. */
  residual: number | null;
}

/** A gem as it lands on the photo. */
export interface RegisteredGem {
  id: string;
  /** Its number on the front view and the placement sheet. */
  number: number;
  toothId: string;
  shape: StudioShape;
  /** Centre, close-up pixels. */
  x: number;
  y: number;
  /** Half its longest side, pixels: its real size times the fitted scale. */
  r: number;
  stretch: readonly [number, number];
  /** Turn on screen, degrees, clockwise: its own, plus the smile's tilt. */
  rotation: number;
  /**
   * `found`: on a tooth found on the photo, inside its visible part; `fitted`:
   * its tooth was only expected there by the fit; `hidden`: its tooth was found
   * but its place is outside the part that shows (behind a lip or the upper teeth).
   */
  tooth: "found" | "fitted" | "hidden";
}

export type RegistrationIssue =
  /** No usable tooth on the photo: nothing can be placed. */
  | "no_teeth"
  /** Fewer than three teeth agree: the fit has little to check itself against. */
  | "few_teeth"
  /** Some found teeth disagreed with the others and were set aside. */
  | "outliers"
  /** Found teeth are not in the order their numbers say, left to right. */
  | "out_of_order"
  /** The fitted scale and the teeth's own widths disagree. */
  | "scale_mismatch"
  /** Some teeth carrying gems were not found: their gems sit where the fit expects them. */
  | "design_teeth_missing"
  /** The function's tooth numbers were shifted by a tooth on an arch: another numbering fitted clearly better. */
  | "renumbered"
  /** The fitted midline is far from the central incisors the photo check saw. */
  | "midline_mismatch";

export interface Registration {
  /** Reference millimetres → close-up pixels: `scale` px per mm, `angle` degrees clockwise, then the shift. */
  transform: { scale: number; angle: number; tx: number; ty: number } | null;
  /** How far down the lower arch sits from where the reference (teeth closed) puts it, mm, before `transform`: the mouth's opening. */
  lowerOffset: number;
  /** Places each arch's numbers were moved by (positive: toward the image's right); 0 when the function's numbers were kept. */
  renumbered: { upper: number; lower: number };
  /** Distance between the fitted midline and the photo check's central incisors, in central incisor widths; null when not measured. */
  midlineError: number | null;
  teeth: RegisteredTooth[];
  /** The gems placed on the photo; empty when nothing could be placed. */
  gems: RegisteredGem[];
  /** Gems not placed: on the tongue side, or without a place on the front view. */
  skipped: number;
  /** Root mean square of the kept teeth's residuals (share of a tooth's width); null under three teeth. */
  rms: number | null;
  /** 0–1. */
  confidence: number;
  /** `confidence >= RELIABLE_CONFIDENCE`, at least `MIN_RELIABLE_TEETH` teeth agreeing, no `midline_mismatch`, and something placed. */
  reliable: boolean;
  issues: RegistrationIssue[];
}

/** From this confidence on, the computed placement may be used. A first value, to tune on real photos. */
export const RELIABLE_CONFIDENCE = 0.6;
/** Under this many teeth agreeing, the fit cannot check itself (two points always fit exactly): never reliable. */
export const MIN_RELIABLE_TEETH = 3;
/** A found tooth farther than this from where the others put it (share of its width) is set aside. */
export const OUTLIER_RESIDUAL = 0.5;
/**
 * How far a lower tooth's biting edge sits above its visible top when the
 * upper teeth cover it, mm: a typical overbite (1–3 mm). A first value, to
 * tune on real photos.
 */
export const LOWER_OVERBITE_MM = 2;
/** The lower arch's offset is looked for in this range, mm, down: a little higher than closed (a deep bite) to a wide-open smile. */
export const LOWER_OFFSET_RANGE: readonly [number, number] = [-4, 20];
/**
 * A midline farther than this from the photo check's (central incisor widths)
 * is an issue, lowers the confidence and makes the placement unreliable
 * (2026-11-05: it only lowered the confidence, which stayed above
 * `RELIABLE_CONFIDENCE` on a trial photo whose whole upper arch was a tooth off).
 */
export const MIDLINE_TOLERANCE = 0.5;
/**
 * The photo check's central incisors box is compared with the midline only
 * when it is 0.6 to this many fitted central incisors wide per tooth (else it
 * is about something else). The check model draws it wide: 1.13 to 1.83 on the
 * 22 analyses of the trial of 2026-11-05, so the former bound (1.6) skipped a
 * third of them, among them two whose upper numbering was a tooth off; its
 * centre stayed within a quarter of a central incisor of the real midline.
 */
export const MAX_CENTRALS_SPAN = 2.5;
/** Another numbering is taken only if it lowers the cost by this much... */
const RENUMBER_MARGIN = 0.08;
/** ...and to this share of the function's numbering's cost or less. */
const RENUMBER_RATIO = 0.6;
/** Weight of the teeth's width disagreement in a numbering's cost (log-ratio variance). */
const WIDTH_WEIGHT = 4;
/**
 * Weight of the midline in a numbering's cost: a tie-breaker, not a verdict —
 * the check model's box may hold a lateral incisor too, and must not outvote
 * teeth that agree with their numbers.
 */
const MIDLINE_WEIGHT = 0.3;
/** A lower tooth's top within this distance (mm) of the upper teeth's edge above it is cut by them. */
const COVERED_TOLERANCE_MM = 0.6;
/** The fitted scale and the teeth's widths may disagree by this factor before it is an issue. */
const SCALE_TOLERANCE = 1.25;

/** Each arch's teeth in their order on the photo, from the image's left: the order a renumbering shifts them along. */
const UPPER_ROW = ["16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26"];
const LOWER_ROW = ["46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36"];

type Point = { x: number; y: number };
type Similarity = { scale: number; angle: number; tx: number; ty: number };
type Pair = { ref: FrontViewTooth; found: FoundTooth };
/** The fit: the lower arch moved down by `lowerOffset` (mm), then the similarity. */
interface ArchFit {
  t: Similarity;
  lowerOffset: number;
}

const widthOf = (t: FrontViewTooth) => t.x1 - t.x0;
const heightOf = (t: FrontViewTooth) => Math.abs(t.incisal - t.cervical);
/** The biting-edge centre of a reference tooth, mm. */
const refEdge = (t: FrontViewTooth): Point => ({ x: (t.x0 + t.x1) / 2, y: t.incisal });
/**
 * The biting-edge centre of a found tooth: the bottom of an upper tooth's box,
 * the top of a lower one's — moved up by the overbite when the upper teeth
 * cover it (`edgeLift`, pixels, by FDI number).
 */
const foundEdge = (f: FoundTooth, lower: boolean, edgeLift?: ReadonlyMap<string, number>): Point => ({
  x: f.x + f.width / 2,
  y: lower ? f.y - (edgeLift?.get(f.fdi) ?? 0) : f.y + f.height,
});

/**
 * Lower teeth whose top touches the upper teeth above them (their biting edge
 * is hidden behind them), with how far up their real edge is, pixels.
 * `pxPerMm`: a first scale, from the teeth's widths.
 */
export function coveredLowerEdges(found: readonly { found: FoundTooth; lower: boolean }[], pxPerMm: number): Map<string, number> {
  const uppers = found.filter((p) => !p.lower).map((p) => p.found);
  const lift = new Map<string, number>();
  if (!(pxPerMm > 0)) return lift;
  for (const p of found) {
    if (!p.lower) continue;
    const f = p.found;
    const above = uppers.filter((u) => Math.min(u.x + u.width, f.x + f.width) - Math.max(u.x, f.x) >= 0.3 * f.width);
    if (above.length === 0) continue;
    const edges = above.map((u) => u.y + u.height);
    const tolerance = COVERED_TOLERANCE_MM * pxPerMm;
    // Its top on the upper teeth's edge (between the edges of the one or two teeth above it):
    // cut by them. A box reaching well above takes the hidden part in already; one well
    // below is an open bite.
    if (f.y >= Math.min(...edges) - tolerance && f.y <= Math.max(...edges) + tolerance) lift.set(f.fdi, LOWER_OVERBITE_MM * pxPerMm);
  }
  return lift;
}

export function applySimilarity(t: Similarity, p: Point): Point {
  const a = (t.angle * Math.PI) / 180;
  const cos = Math.cos(a) * t.scale;
  const sin = Math.sin(a) * t.scale;
  return { x: p.x * cos - p.y * sin + t.tx, y: p.x * sin + p.y * cos + t.ty };
}

/** The point of the reference frame that `t` takes to `q`. */
function invertSimilarity(t: Similarity, q: Point): Point {
  const a = (t.angle * Math.PI) / 180;
  const dx = q.x - t.tx;
  const dy = q.y - t.ty;
  return { x: (dx * Math.cos(a) + dy * Math.sin(a)) / t.scale, y: (-dx * Math.sin(a) + dy * Math.cos(a)) / t.scale };
}

/**
 * The similarity taking `from` onto `to` in the least-squares sense (2D
 * Umeyama, no reflection). Two points or more; null when they all coincide.
 */
export function fitSimilarity(from: Point[], to: Point[]): Similarity | null {
  const n = from.length;
  if (n < 2 || to.length !== n) return null;
  const mean = (ps: Point[]) => ({ x: ps.reduce((s, p) => s + p.x, 0) / n, y: ps.reduce((s, p) => s + p.y, 0) / n });
  const fm = mean(from);
  const tm = mean(to);
  let dot = 0;
  let cross = 0;
  let norm = 0;
  for (let i = 0; i < n; i++) {
    const ax = from[i].x - fm.x;
    const ay = from[i].y - fm.y;
    const bx = to[i].x - tm.x;
    const by = to[i].y - tm.y;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
    norm += ax * ax + ay * ay;
  }
  if (norm < 1e-9) return null;
  const angle = Math.atan2(cross, dot);
  const scale = Math.hypot(dot, cross) / norm;
  if (!(scale > 0)) return null;
  const t: Similarity = { scale, angle: (angle * 180) / Math.PI, tx: 0, ty: 0 };
  const moved = applySimilarity(t, fm);
  return { ...t, tx: tm.x - moved.x, ty: tm.y - moved.y };
}

/** A reference point on the photo: on the lower arch, moved down by the offset first. */
function placeRef(fit: ArchFit, p: Point, lower: boolean): Point {
  return applySimilarity(fit.t, lower ? { x: p.x, y: p.y + fit.lowerOffset } : p);
}

/**
 * The similarity, and the lower arch's offset when both arches have teeth and
 * there are three teeth or more (with fewer, the offset would always fit).
 * Found by turns: the similarity for an offset, then the offset (the lower
 * teeth's mean gap, in the reference's frame) for that similarity; a few
 * rounds settle it. The offset stays within `LOWER_OFFSET_RANGE`.
 */
export function fitArches(refs: readonly { p: Point; lower: boolean }[], targets: readonly Point[]): ArchFit | null {
  const n = refs.length;
  const lowers = refs.filter((r) => r.lower).length;
  const moved = (d: number) => refs.map((r) => (r.lower ? { x: r.p.x, y: r.p.y + d } : r.p));
  let t = fitSimilarity(moved(0), [...targets]);
  if (!t || lowers === 0 || lowers === n || n < 3) return t ? { t, lowerOffset: 0 } : null;
  let d = 0;
  for (let round = 0; round < 12; round++) {
    const gaps = refs.flatMap((r, i) => (r.lower ? [invertSimilarity(t!, targets[i]).y - r.p.y] : []));
    const next = Math.min(LOWER_OFFSET_RANGE[1], Math.max(LOWER_OFFSET_RANGE[0], gaps.reduce((s, g) => s + g, 0) / gaps.length));
    if (Math.abs(next - d) < 1e-4) break;
    d = next;
    const refit = fitSimilarity(moved(d), [...targets]);
    if (!refit) break;
    t = refit;
  }
  return { t, lowerOffset: d };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Pairs of teeth of one arch whose left-to-right order on the photo contradicts their numbers. */
function outOfOrder(pairs: Pair[]): boolean {
  for (const lower of [false, true]) {
    const arch = pairs.filter((p) => p.ref.lower === lower);
    for (let i = 0; i < arch.length; i++) {
      for (let j = i + 1; j < arch.length; j++) {
        const refOrder = refEdge(arch[i].ref).x - refEdge(arch[j].ref).x;
        const photoOrder = foundEdge(arch[i].found, lower).x - foundEdge(arch[j].found, lower).x;
        if (refOrder * photoOrder < 0) return true;
      }
    }
  }
  return false;
}

/**
 * The found teeth with each arch's numbers moved `upper` / `lower` places
 * along it (positive: toward the image's right); a tooth moved off its arch is
 * dropped. The boxes do not move: only their names.
 */
export function shiftNumbering(found: readonly FoundTooth[], upper: number, lower: number): FoundTooth[] {
  return found.flatMap((f) => {
    for (const [row, shift] of [
      [UPPER_ROW, upper],
      [LOWER_ROW, lower],
    ] as const) {
      const i = row.indexOf(f.fdi);
      if (i < 0) continue;
      const fdi = row[i + shift];
      return fdi ? [{ ...f, fdi }] : [];
    }
    return [];
  });
}

/** One numbering's fit: the teeth paired with the reference, the fit, the teeth kept and set aside. */
interface Solution {
  pairs: Pair[];
  fit: ArchFit;
  kept: Pair[];
  setAside: Set<string>;
  edgeOf: (f: FoundTooth, lower: boolean) => Point;
  residualOf: (p: Pair) => number;
}

/** The fit of the reference onto `found`, setting aside the tooth that disagrees most while three or more remain. */
function solve(refByFdi: ReadonlyMap<string, FrontViewTooth>, found: readonly FoundTooth[]): Solution | null {
  const pairs = found.flatMap((f) => {
    const ref = refByFdi.get(f.fdi);
    return ref && widthOf(ref) > 0 && f.width > 0 && f.height > 0 ? [{ ref, found: f }] : [];
  });
  if (pairs.length === 0) return null;

  // Lower teeth covered by the upper ones: their real biting edge is above their box.
  const firstScale = median(pairs.map((p) => p.found.width / widthOf(p.ref)));
  const edgeLift = coveredLowerEdges(
    pairs.map((p) => ({ found: p.found, lower: p.ref.lower })),
    firstScale,
  );
  const edgeOf = (f: FoundTooth, lower: boolean) => foundEdge(f, lower, edgeLift);

  const residualFor = (fit: ArchFit, p: Pair) => {
    const expected = placeRef(fit, refEdge(p.ref), p.ref.lower);
    const actual = edgeOf(p.found, p.ref.lower);
    return Math.hypot(expected.x - actual.x, expected.y - actual.y) / (widthOf(p.ref) * fit.t.scale);
  };
  const fitOf = (list: Pair[]): ArchFit | null => {
    if (list.length >= 2) return fitArches(list.map((p) => ({ p: refEdge(p.ref), lower: p.ref.lower })), list.map((p) => edgeOf(p.found, p.ref.lower)));
    // One tooth: its width gives the scale, no tilt.
    const [p] = list;
    const scale = p.found.width / widthOf(p.ref);
    const edge = refEdge(p.ref);
    const target = edgeOf(p.found, p.ref.lower);
    return { t: { scale, angle: 0, tx: target.x - edge.x * scale, ty: target.y - edge.y * scale }, lowerOffset: 0 };
  };

  let kept = [...pairs];
  const setAside = new Set<string>();
  let fit = fitOf(kept);
  while (fit && kept.length >= 3) {
    const residuals = kept.map((p) => residualFor(fit!, p));
    const worst = residuals.indexOf(Math.max(...residuals));
    if (residuals[worst] <= OUTLIER_RESIDUAL) break;
    setAside.add(kept[worst].found.fdi);
    kept = kept.filter((_, i) => i !== worst);
    fit = fitOf(kept);
  }
  if (!fit) return null;
  const final = fit;
  return { pairs, fit: final, kept, setAside, edgeOf, residualOf: (p) => residualFor(final, p) };
}

/**
 * How far the fitted midline (between the upper central incisors' edges) is
 * from the centre of the photo check's central incisors box, along the
 * smile, in central incisor widths. Null without the box, or when the box is
 * not about two central incisors wide (it is then about something else).
 */
function midlineError(fit: ArchFit, centrals: CloseUpBox | null, refByFdi: ReadonlyMap<string, FrontViewTooth>): number | null {
  const r11 = refByFdi.get("11");
  const r21 = refByFdi.get("21");
  if (!centrals || !r11 || !r21 || !(centrals.width > 0)) return null;
  const unit = ((widthOf(r11) + widthOf(r21)) / 2) * fit.t.scale;
  if (!(unit > 0)) return null;
  const span = centrals.width / (2 * unit);
  if (span < 0.6 || span > MAX_CENTRALS_SPAN) return null;
  const at = placeRef(fit, { x: (r11.x1 + r21.x0) / 2, y: (r11.incisal + r21.incisal) / 2 }, false);
  const a = (fit.t.angle * Math.PI) / 180;
  const dx = centrals.x + centrals.width / 2 - at.x;
  const dy = centrals.y + centrals.height / 2 - at.y;
  return Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) / unit;
}

/**
 * How badly a numbering fits, per tooth found: each tooth's distance from
 * where the fit puts it (capped at a tooth's width, a tooth the numbering
 * drops counting as a full width), how far the teeth's widths disagree with
 * their numbers' (a central incisor named lateral is too wide), and the
 * midline's distance from the photo check's.
 */
function numberingCost(solution: Solution | null, total: number, centrals: CloseUpBox | null, refByFdi: ReadonlyMap<string, FrontViewTooth>) {
  if (!solution) return { cost: Infinity, midline: null };
  const { pairs } = solution;
  const place = pairs.reduce((s, p) => s + Math.min(1, solution.residualOf(p)) ** 2, 0) + Math.max(0, total - pairs.length);
  const logs = pairs.map((p) => Math.log(p.found.width / widthOf(p.ref)));
  const middle = median(logs);
  const width = WIDTH_WEIGHT * logs.reduce((s, l) => s + Math.min(0.16, (l - middle) ** 2), 0);
  const midline = midlineError(solution.fit, centrals, refByFdi);
  return { cost: (place + width) / Math.max(1, total) + (midline === null ? 0 : MIDLINE_WEIGHT * Math.min(1.5, midline) ** 2), midline };
}

/**
 * Place the creation's gems on the photo from the teeth found on it (see the
 * module comment). `found` comes from the function, already checked; teeth the
 * front view does not know are ignored. `centrals`: the photo check's box
 * around the two upper central incisors, in the close-up's pixels, when it gave one.
 */
export function registerDesign(
  projection: Pick<FrontViewProjection, "teeth" | "gems">,
  found: readonly FoundTooth[],
  options: { centrals?: CloseUpBox | null } = {},
): Registration {
  const refByFdi = new Map(projection.teeth.map((t) => [t.fdi, t]));
  const centrals = options.centrals ?? null;
  const front = projection.gems.filter((g) => g.at && g.at.facing === "front");
  const skipped = projection.gems.length - front.length;
  const designTeeth = [...new Set(front.map((g) => g.toothId))];

  const empty = (issues: RegistrationIssue[]): Registration => ({
    transform: null,
    lowerOffset: 0,
    renumbered: { upper: 0, lower: 0 },
    midlineError: null,
    teeth: [],
    gems: [],
    skipped,
    rms: null,
    confidence: 0,
    reliable: false,
    issues,
  });

  // 1–2. The fit for the function's numbering, and for each arch one tooth to either side.
  const total = found.filter((f) => refByFdi.has(f.fdi)).length;
  const hasArch = (row: readonly string[]) => found.some((f) => row.includes(f.fdi));
  const candidates: { upper: number; lower: number; solution: Solution | null; cost: number; midline: number | null }[] = [];
  for (const upper of hasArch(UPPER_ROW) ? [0, -1, 1] : [0]) {
    for (const lower of hasArch(LOWER_ROW) ? [0, -1, 1] : [0]) {
      const solution = solve(refByFdi, upper || lower ? shiftNumbering(found, upper, lower) : found);
      candidates.push({ upper, lower, solution, ...numberingCost(solution, total, centrals, refByFdi) });
    }
  }
  const given = candidates[0];
  if (!given.solution) return empty(["no_teeth"]);
  const best = candidates.reduce((a, b) => (b.cost < a.cost ? b : a));
  const chosen = best !== given && best.cost <= given.cost - RENUMBER_MARGIN && best.cost <= given.cost * RENUMBER_RATIO ? best : given;
  const { pairs, fit, kept, setAside, edgeOf, residualOf } = chosen.solution!;
  const t = fit.t;

  // 3a. The teeth: found (kept or set aside), and the fitted reference for design teeth not kept.
  const teeth: RegisteredTooth[] = pairs.map((p) => ({
    fdi: p.found.fdi,
    lower: p.ref.lower,
    x: p.found.x,
    y: p.found.y,
    width: p.found.width,
    height: p.found.height,
    source: setAside.has(p.found.fdi) ? "outlier" : "found",
    residual: residualOf(p),
  }));
  const keptByFdi = new Map(kept.map((p) => [p.found.fdi, p.found]));
  for (const fdi of designTeeth) {
    if (keptByFdi.has(fdi)) continue;
    const ref = refByFdi.get(fdi);
    if (!ref) continue;
    const centre = placeRef(fit, { x: (ref.x0 + ref.x1) / 2, y: (ref.cervical + ref.incisal) / 2 }, ref.lower);
    const width = widthOf(ref) * t.scale;
    const height = heightOf(ref) * t.scale;
    teeth.push({ fdi, lower: ref.lower, x: centre.x - width / 2, y: centre.y - height / 2, width, height, source: "fitted", residual: null });
  }

  // 3b–5. The gems on their teeth, at their real size.
  const a = (t.angle * Math.PI) / 180;
  const gems: RegisteredGem[] = front.flatMap((g): RegisteredGem[] => {
    const ref = refByFdi.get(g.toothId);
    const at = g.at!;
    if (!ref) return [];
    const box = keptByFdi.get(g.toothId);
    let x: number;
    let y: number;
    if (box) {
      // Across: its share of the customer's tooth; up: its real distance from the biting edge.
      const across = (at.x - ref.x0) / widthOf(ref) - 0.5;
      const edge = edgeOf(box, ref.lower);
      const dx = across * box.width;
      const dy = (at.y - ref.incisal) * t.scale;
      x = edge.x + dx * Math.cos(a) - dy * Math.sin(a);
      y = edge.y + dx * Math.sin(a) + dy * Math.cos(a);
    } else {
      ({ x, y } = placeRef(fit, { x: at.x, y: at.y }, ref.lower));
    }
    return [
      {
        id: g.id,
        number: g.number,
        toothId: g.toothId,
        shape: g.shape,
        x,
        y,
        r: at.r * t.scale,
        stretch: at.stretch,
        rotation: at.rotation + t.angle,
        tooth: !box ? "fitted" : x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height ? "found" : "hidden",
      },
    ];
  });

  // How far to trust it.
  const issues: RegistrationIssue[] = [];
  if (kept.length < MIN_RELIABLE_TEETH) issues.push("few_teeth");
  if (setAside.size > 0) issues.push("outliers");
  const ordered = !outOfOrder(pairs);
  if (!ordered) issues.push("out_of_order");
  const widthScale = median(kept.map((p) => p.found.width / widthOf(p.ref)));
  const scaleRatio = t.scale / widthScale;
  const scaleOk = kept.length < 2 || (scaleRatio <= SCALE_TOLERANCE && scaleRatio >= 1 / SCALE_TOLERANCE);
  if (!scaleOk) issues.push("scale_mismatch");
  const covered = designTeeth.filter((fdi) => keptByFdi.has(fdi)).length;
  if (covered < designTeeth.length) issues.push("design_teeth_missing");
  if (chosen !== given) issues.push("renumbered");
  const midlineOk = chosen.midline === null || chosen.midline <= MIDLINE_TOLERANCE;
  if (!midlineOk) issues.push("midline_mismatch");

  const rms = kept.length >= 3 ? Math.sqrt(kept.reduce((s, p) => s + residualOf(p) ** 2, 0) / kept.length) : null;
  const coverage = designTeeth.length ? covered / designTeeth.length : 1;
  const agreement = rms === null ? 0.5 : Math.max(0, 1 - rms / 0.35);
  const evidence = Math.min(1, kept.length / 4);
  const raw = 0.4 * coverage + 0.3 * agreement + 0.3 * evidence;
  const confidence = Math.round(raw * (ordered ? 1 : 0.5) * (scaleOk ? 1 : 0.6) * (midlineOk ? 1 : 0.7) * 100) / 100;

  return {
    transform: t,
    lowerOffset: Math.round(fit.lowerOffset * 100) / 100,
    renumbered: { upper: chosen.upper, lower: chosen.lower },
    midlineError: chosen.midline === null ? null : Math.round(chosen.midline * 1000) / 1000,
    teeth,
    gems,
    skipped,
    rms: rms === null ? null : Math.round(rms * 1000) / 1000,
    confidence,
    reliable: gems.length > 0 && kept.length >= MIN_RELIABLE_TEETH && confidence >= RELIABLE_CONFIDENCE && midlineOk,
    issues,
  };
}
