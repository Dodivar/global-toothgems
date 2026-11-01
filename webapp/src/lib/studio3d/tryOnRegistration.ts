import type { StudioShape } from "../../data/studioEditor";
import type { FrontViewProjection, FrontViewTooth } from "./frontView";

/**
 * The computed placement of a try-on (decision 111 (k), 2026-11-01): where
 * each gem of a creation goes on the customer's photo, worked out from the
 * teeth found on it — so the image model no longer decides where to draw.
 *
 * Input: the teeth the function found on the mouth close-up, each with its
 * FDI number and box (`teeth.ts` in `studio-try-on`), and the creation's front
 * view (`projectFrontView`): the Studio's reference dentition in real
 * millimetres, every gem at its place and real size on its tooth.
 *
 * 1. The reference dentition is fitted onto the found teeth by one
 *    similarity (scale, turn, shift), on each tooth's biting-edge centre — the
 *    part lips hide least. Teeth that do not agree with the others (a wrong
 *    number, a box on two teeth) are set aside, one at a time, while three or
 *    more remain.
 * 2. Each gem is put on its own tooth: across it, at its share of the found
 *    box's width (the customer's own tooth); up from its biting edge, at its
 *    real distance in millimetres times the fitted scale. A design tooth that
 *    was not found, or was set aside, takes the fitted reference tooth.
 * 3. Its size is physical (owner's decision, 2026-11-01): its real size in
 *    millimetres times the fitted scale — a 2 mm gem stays 2 mm, whatever the
 *    width of the customer's teeth.
 *
 * A confidence (0–1) says how far the result can be trusted; below
 * `RELIABLE_CONFIDENCE` the computed placement is not to be used. For now
 * only the staff's placement diagnostic shows it; renders still place the
 * gems the current way.
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
  /** Whether its tooth was found (`found`) or only expected there by the fit (`fitted`). */
  tooth: "found" | "fitted";
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
  | "design_teeth_missing";

export interface Registration {
  /** Reference millimetres → close-up pixels: `scale` px per mm, `angle` degrees clockwise, then the shift. */
  transform: { scale: number; angle: number; tx: number; ty: number } | null;
  teeth: RegisteredTooth[];
  /** The gems placed on the photo; empty when nothing could be placed. */
  gems: RegisteredGem[];
  /** Gems not placed: on the tongue side, or without a place on the front view. */
  skipped: number;
  /** Root mean square of the kept teeth's residuals (share of a tooth's width); null under three teeth. */
  rms: number | null;
  /** 0–1. */
  confidence: number;
  /** `confidence >= RELIABLE_CONFIDENCE`, at least `MIN_RELIABLE_TEETH` teeth agreeing, and something placed. */
  reliable: boolean;
  issues: RegistrationIssue[];
}

/** From this confidence on, the computed placement may be used. A first value, to tune on real photos. */
export const RELIABLE_CONFIDENCE = 0.6;
/** Under this many teeth agreeing, the fit cannot check itself (two points always fit exactly): never reliable. */
export const MIN_RELIABLE_TEETH = 3;
/** A found tooth farther than this from where the others put it (share of its width) is set aside. */
export const OUTLIER_RESIDUAL = 0.5;
/** The fitted scale and the teeth's widths may disagree by this factor before it is an issue. */
const SCALE_TOLERANCE = 1.25;

type Point = { x: number; y: number };
type Similarity = { scale: number; angle: number; tx: number; ty: number };

const widthOf = (t: FrontViewTooth) => t.x1 - t.x0;
const heightOf = (t: FrontViewTooth) => Math.abs(t.incisal - t.cervical);
/** The biting-edge centre of a reference tooth, mm. */
const refEdge = (t: FrontViewTooth): Point => ({ x: (t.x0 + t.x1) / 2, y: t.incisal });
/** The biting-edge centre of a found tooth: the bottom of an upper tooth's box, the top of a lower one's. */
const foundEdge = (f: FoundTooth, lower: boolean): Point => ({ x: f.x + f.width / 2, y: lower ? f.y : f.y + f.height });

export function applySimilarity(t: Similarity, p: Point): Point {
  const a = (t.angle * Math.PI) / 180;
  const cos = Math.cos(a) * t.scale;
  const sin = Math.sin(a) * t.scale;
  return { x: p.x * cos - p.y * sin + t.tx, y: p.x * sin + p.y * cos + t.ty };
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

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Pairs of teeth of one arch whose left-to-right order on the photo contradicts their numbers. */
function outOfOrder(pairs: { ref: FrontViewTooth; found: FoundTooth }[]): boolean {
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
 * Place the creation's gems on the photo from the teeth found on it (see the
 * module comment). `found` comes from the function, already checked; teeth the
 * front view does not know are ignored.
 */
export function registerDesign(projection: Pick<FrontViewProjection, "teeth" | "gems">, found: readonly FoundTooth[]): Registration {
  const refByFdi = new Map(projection.teeth.map((t) => [t.fdi, t]));
  const pairs = found.flatMap((f) => {
    const ref = refByFdi.get(f.fdi);
    return ref && widthOf(ref) > 0 && f.width > 0 && f.height > 0 ? [{ ref, found: f }] : [];
  });
  const front = projection.gems.filter((g) => g.at && g.at.facing === "front");
  const skipped = projection.gems.length - front.length;
  const designTeeth = [...new Set(front.map((g) => g.toothId))];

  const empty = (issues: RegistrationIssue[]): Registration => ({
    transform: null,
    teeth: [],
    gems: [],
    skipped,
    rms: null,
    confidence: 0,
    reliable: false,
    issues,
  });
  if (pairs.length === 0) return empty(["no_teeth"]);

  // 1. The fit, setting aside the tooth that disagrees most while three or more remain.
  let kept = [...pairs];
  const setAside = new Set<string>();
  const residualOf = (t: Similarity, p: (typeof pairs)[number]) => {
    const expected = applySimilarity(t, refEdge(p.ref));
    const actual = foundEdge(p.found, p.ref.lower);
    return Math.hypot(expected.x - actual.x, expected.y - actual.y) / (widthOf(p.ref) * t.scale);
  };
  const fit = (list: typeof pairs): Similarity | null => {
    if (list.length >= 2) return fitSimilarity(list.map((p) => refEdge(p.ref)), list.map((p) => foundEdge(p.found, p.ref.lower)));
    // One tooth: its width gives the scale, no tilt.
    const [p] = list;
    const scale = p.found.width / widthOf(p.ref);
    const edge = refEdge(p.ref);
    const target = foundEdge(p.found, p.ref.lower);
    return { scale, angle: 0, tx: target.x - edge.x * scale, ty: target.y - edge.y * scale };
  };
  let transform = fit(kept);
  while (transform && kept.length >= 3) {
    const residuals = kept.map((p) => residualOf(transform!, p));
    const worst = residuals.indexOf(Math.max(...residuals));
    if (residuals[worst] <= OUTLIER_RESIDUAL) break;
    setAside.add(kept[worst].found.fdi);
    kept = kept.filter((_, i) => i !== worst);
    transform = fit(kept);
  }
  if (!transform) return empty(["no_teeth"]);
  const t = transform;

  // 2. The teeth: found (kept or set aside), and the fitted reference for design teeth not kept.
  const teeth: RegisteredTooth[] = pairs.map((p) => ({
    fdi: p.found.fdi,
    lower: p.ref.lower,
    x: p.found.x,
    y: p.found.y,
    width: p.found.width,
    height: p.found.height,
    source: setAside.has(p.found.fdi) ? "outlier" : "found",
    residual: residualOf(t, p),
  }));
  const keptByFdi = new Map(kept.map((p) => [p.found.fdi, p.found]));
  for (const fdi of designTeeth) {
    if (keptByFdi.has(fdi)) continue;
    const ref = refByFdi.get(fdi);
    if (!ref) continue;
    const centre = applySimilarity(t, { x: (ref.x0 + ref.x1) / 2, y: (ref.cervical + ref.incisal) / 2 });
    const width = widthOf(ref) * t.scale;
    const height = heightOf(ref) * t.scale;
    teeth.push({ fdi, lower: ref.lower, x: centre.x - width / 2, y: centre.y - height / 2, width, height, source: "fitted", residual: null });
  }

  // 3. The gems on their teeth, at their real size.
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
      const edge = foundEdge(box, ref.lower);
      const dx = across * box.width;
      const dy = (at.y - ref.incisal) * t.scale;
      x = edge.x + dx * Math.cos(a) - dy * Math.sin(a);
      y = edge.y + dx * Math.sin(a) + dy * Math.cos(a);
    } else {
      ({ x, y } = applySimilarity(t, { x: at.x, y: at.y }));
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
        tooth: box ? "found" : "fitted",
      },
    ];
  });

  // 4. How far to trust it.
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

  const rms = kept.length >= 3 ? Math.sqrt(kept.reduce((s, p) => s + residualOf(t, p) ** 2, 0) / kept.length) : null;
  const coverage = designTeeth.length ? covered / designTeeth.length : 1;
  const agreement = rms === null ? 0.5 : Math.max(0, 1 - rms / 0.35);
  const evidence = Math.min(1, kept.length / 4);
  const raw = 0.4 * coverage + 0.3 * agreement + 0.3 * evidence;
  const confidence = Math.round(raw * (ordered ? 1 : 0.5) * (scaleOk ? 1 : 0.6) * 100) / 100;

  return {
    transform: t,
    teeth,
    gems,
    skipped,
    rms: rms === null ? null : Math.round(rms * 1000) / 1000,
    confidence,
    reliable: gems.length > 0 && kept.length >= MIN_RELIABLE_TEETH && confidence >= RELIABLE_CONFIDENCE,
    issues,
  };
}
