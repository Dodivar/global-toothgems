import { LOWER_TEETH, UPPER_TEETH, toothKeys, type ToothKey, type Vec3 } from "../../data/studioEditor";
import {
  buildCrown,
  cuspReach,
  DEFAULT_CROWN_RESOLUTION,
  type CanineParams,
  type CrownMesh,
  type CrownParams,
  type CrownPlacement,
  type CrownResolution,
  type IncisorParams,
  type PosteriorParams,
} from "./crownShape";
import type { CrownFrame } from "./dentition";

/**
 * The Studio's dentition: both arches of smooth, separate crowns, without
 * gum or socle, the mouth slightly open — the brand's reference smile.
 *
 * The incisors keep the reference drawing's look (broad blades with rounded
 * corners above, narrow shields below, domed where the gum would be). The
 * canines, premolars and molars are shaped like real ones — a pointed cusp,
 * cusps round a fossa — with broad, gently curved labial faces a gem can
 * sit on, where the drawing had rounded pills.
 *
 * Everything is at real size, in the Studio's world units (millimetres):
 * average adult crown widths, heights and depths, laid side by side along
 * an arch measured on real ones (inter-canine and inter-molar widths, arch
 * depth). The world: x to the viewer's right (the patient's left), y up, z
 * toward the viewer; the origin on the midline between the two arches, at
 * the upper central incisors' crown centres.
 *
 * Pure numbers, no three.js: the engine wraps the meshes in buffers, the
 * front view and the tests read the frames.
 */

const incisor = (p: Omit<IncisorParams, "kind">): IncisorParams => ({ kind: "incisor", ...p });
const canine = (p: Omit<CanineParams, "kind">): CanineParams => ({ kind: "canine", ...p });
const premolar = (p: Omit<PosteriorParams, "kind">): PosteriorParams => ({ kind: "premolar", ...p });
const molar = (p: Omit<PosteriorParams, "kind">): PosteriorParams => ({ kind: "molar", ...p });

interface ToothDesign {
  crown: CrownParams;
  /** Mesiodistal width laid along the arch, mm. */
  width: number;
  /** Labial crown tip: how far the biting end leans out of the arch, degrees (negative: in). */
  inclination: number;
  /** Mesial crown tip: how far the biting end leans toward the midline, degrees. */
  angulation: number;
}

/*
 * Average adult crowns (Wheeler's tables, rounded; the lower incisors at the
 * broad end of the range, as the drawing has them). The visible crown runs
 * from the edge or the cusp tips to the gum line; the dome above it stands
 * for the gum, as on the drawing. A premolar's or molar's `crownHeight` is
 * counted from its occlusal table, its cusps rising past it (real crown
 * height = crownHeight + the highest cusp).
 */
const UPPER: Record<ToothKey, ToothDesign> = {
  central: {
    width: 8.6,
    inclination: 10,
    angulation: 4,
    crown: incisor({
      crownHeight: 9.6, domeHeight: 3.4, domeRoundness: 2,
      halfWidthMesial: 4.3, halfWidthDistal: 4.3, contactLevel: 2.4, cervicalWidth: 0.8,
      halfDepthLabial: 3.0, halfDepthLingual: 3.5, cervicalDepth: 0.92, squareness: 2.6,
      cornerMesial: 1.1, cornerDistal: 1.9, edgeRadius: 0.35, slopeLabial: 0.42, slopeLingual: 0.62,
    }),
  },
  lateral: {
    width: 6.6,
    inclination: 9,
    angulation: 7,
    crown: incisor({
      crownHeight: 8.6, domeHeight: 3.0, domeRoundness: 1.9,
      halfWidthMesial: 3.3, halfWidthDistal: 3.3, contactLevel: 2.1, cervicalWidth: 0.78,
      halfDepthLabial: 2.7, halfDepthLingual: 3.1, cervicalDepth: 0.92, squareness: 2.5,
      cornerMesial: 1.1, cornerDistal: 2.1, edgeRadius: 0.33, slopeLabial: 0.42, slopeLingual: 0.6,
    }),
  },
  canine: {
    width: 7.6,
    inclination: 4,
    angulation: 7,
    crown: canine({
      crownHeight: 9.6, domeHeight: 3.0, domeRoundness: 1.9,
      halfWidthMesial: 3.8, halfWidthDistal: 3.8, contactLevel: 3.6, cervicalWidth: 0.78,
      halfDepthLabial: 3.7, halfDepthLingual: 4.0, cervicalDepth: 0.9, squareness: 2.7,
      slopeMesial: 1.5, slopeDistal: 1.1, slopeLabial: 1.25, slopeLingual: 1.15, tipRadius: 0.55,
    }),
  },
  pm1: {
    width: 7.0,
    inclination: 0,
    angulation: 2,
    crown: premolar({
      crownHeight: 7.2, domeHeight: 2.4, domeRoundness: 2,
      halfWidthMesial: 3.5, halfWidthDistal: 3.5, contactLevel: 2.1, cervicalWidth: 0.78,
      halfDepthLabial: 4.5, halfDepthLingual: 4.4, cervicalDepth: 0.93, squareness: 3.2,
      marginRadius: 1.4, occlusalDepthLabial: 0.86, occlusalDepthLingual: 0.74, contourLabial: 4.8, contourLingual: 3.4,
      cusps: [
        { x: -0.2, z: 2.3, height: 1.3, radius: 1.7 },
        { x: 0.3, z: -2.2, height: 0.8, radius: 1.6 },
      ],
      fossaDepth: 0.35,
    }),
  },
  pm2: {
    width: 6.7,
    inclination: 0,
    angulation: 2,
    crown: premolar({
      crownHeight: 7.0, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 3.35, halfWidthDistal: 3.35, contactLevel: 2.1, cervicalWidth: 0.78,
      halfDepthLabial: 4.5, halfDepthLingual: 4.4, cervicalDepth: 0.93, squareness: 3.2,
      marginRadius: 1.4, occlusalDepthLabial: 0.86, occlusalDepthLingual: 0.76, contourLabial: 4.6, contourLingual: 3.3,
      cusps: [
        { x: 0, z: 2.3, height: 1.0, radius: 1.8 },
        { x: 0, z: -2.2, height: 0.85, radius: 1.7 },
      ],
      fossaDepth: 0.3,
    }),
  },
  m1: {
    width: 10.2,
    inclination: 3,
    angulation: 4,
    crown: molar({
      crownHeight: 6.45, domeHeight: 2.4, domeRoundness: 2,
      halfWidthMesial: 5.1, halfWidthDistal: 5.1, contactLevel: 2.1, cervicalWidth: 0.82,
      halfDepthLabial: 5.4, halfDepthLingual: 5.6, cervicalDepth: 0.93, squareness: 3.3,
      marginRadius: 1.7, occlusalDepthLabial: 0.88, occlusalDepthLingual: 0.78, contourLabial: 4.4, contourLingual: 3.0,
      cusps: [
        { x: -2.4, z: 2.9, height: 0.95, radius: 1.65 },
        { x: 2.4, z: 2.9, height: 0.8, radius: 1.6 },
        { x: -2.0, z: -2.9, height: 1.05, radius: 1.9 },
        { x: 2.7, z: -2.8, height: 0.6, radius: 1.5 },
      ],
      fossaDepth: 0.5,
    }),
  },
  m2: {
    width: 9.2,
    inclination: 3,
    angulation: 2,
    crown: molar({
      crownHeight: 6.0, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 4.6, halfWidthDistal: 4.6, contactLevel: 2.0, cervicalWidth: 0.82,
      halfDepthLabial: 5.4, halfDepthLingual: 5.4, cervicalDepth: 0.93, squareness: 3.3,
      marginRadius: 1.65, occlusalDepthLabial: 0.88, occlusalDepthLingual: 0.78, contourLabial: 4.1, contourLingual: 2.8,
      cusps: [
        { x: -2.1, z: 2.8, height: 0.9, radius: 1.6 },
        { x: 2.0, z: 2.7, height: 0.65, radius: 1.5 },
        { x: -1.6, z: -2.8, height: 1.0, radius: 1.8 },
        { x: 2.3, z: -2.6, height: 0.4, radius: 1.4 },
      ],
      fossaDepth: 0.45,
    }),
  },
};

const LOWER: Record<ToothKey, ToothDesign> = {
  central: {
    width: 5.8,
    inclination: 4,
    angulation: 0,
    crown: incisor({
      crownHeight: 8.2, domeHeight: 2.9, domeRoundness: 1.85,
      halfWidthMesial: 2.9, halfWidthDistal: 2.9, contactLevel: 1.6, cervicalWidth: 0.74,
      halfDepthLabial: 2.6, halfDepthLingual: 3.1, cervicalDepth: 0.92, squareness: 2.5,
      cornerMesial: 0.55, cornerDistal: 0.7, edgeRadius: 0.3, slopeLabial: 0.36, slopeLingual: 0.52,
    }),
  },
  lateral: {
    width: 6.2,
    inclination: 4,
    angulation: 1,
    crown: incisor({
      crownHeight: 8.5, domeHeight: 2.9, domeRoundness: 1.85,
      halfWidthMesial: 3.1, halfWidthDistal: 3.1, contactLevel: 1.7, cervicalWidth: 0.74,
      halfDepthLabial: 2.7, halfDepthLingual: 3.2, cervicalDepth: 0.92, squareness: 2.5,
      cornerMesial: 0.6, cornerDistal: 0.95, edgeRadius: 0.3, slopeLabial: 0.36, slopeLingual: 0.52,
    }),
  },
  canine: {
    width: 7.0,
    inclination: 2,
    angulation: 4,
    crown: canine({
      crownHeight: 10.0, domeHeight: 3.0, domeRoundness: 1.7,
      halfWidthMesial: 3.5, halfWidthDistal: 3.5, contactLevel: 3.0, cervicalWidth: 0.74,
      halfDepthLabial: 3.4, halfDepthLingual: 3.8, cervicalDepth: 0.9, squareness: 2.7,
      slopeMesial: 1.7, slopeDistal: 1.2, slopeLabial: 1.2, slopeLingual: 1.1, tipRadius: 0.5,
    }),
  },
  pm1: {
    width: 7.0,
    inclination: -6,
    angulation: 1,
    crown: premolar({
      crownHeight: 7.2, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 3.5, halfWidthDistal: 3.5, contactLevel: 2.1, cervicalWidth: 0.76,
      halfDepthLabial: 3.9, halfDepthLingual: 3.6, cervicalDepth: 0.93, squareness: 3.2,
      marginRadius: 1.3, occlusalDepthLabial: 0.86, occlusalDepthLingual: 0.64, contourLabial: 4.8, contourLingual: 3.8,
      cusps: [
        { x: -0.1, z: 1.1, height: 1.3, radius: 1.7 },
        { x: 0.2, z: -2.0, height: 0.3, radius: 1.2 },
      ],
      fossaDepth: 0.2,
    }),
  },
  pm2: {
    width: 7.1,
    inclination: -8,
    angulation: 1,
    crown: premolar({
      crownHeight: 7.0, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 3.55, halfWidthDistal: 3.55, contactLevel: 2.1, cervicalWidth: 0.78,
      halfDepthLabial: 4.1, halfDepthLingual: 4.0, cervicalDepth: 0.93, squareness: 3.2,
      marginRadius: 1.35, occlusalDepthLabial: 0.86, occlusalDepthLingual: 0.7, contourLabial: 4.6, contourLingual: 3.6,
      cusps: [
        { x: 0, z: 1.4, height: 1.0, radius: 1.8 },
        { x: -1.0, z: -2.1, height: 0.6, radius: 1.3 },
        { x: 1.3, z: -2.0, height: 0.45, radius: 1.2 },
      ],
      fossaDepth: 0.25,
    }),
  },
  m1: {
    width: 11.0,
    inclination: -12,
    angulation: 2,
    crown: molar({
      crownHeight: 6.55, domeHeight: 2.4, domeRoundness: 2,
      halfWidthMesial: 5.5, halfWidthDistal: 5.5, contactLevel: 2.2, cervicalWidth: 0.82,
      halfDepthLabial: 5.0, halfDepthLingual: 5.2, cervicalDepth: 0.93, squareness: 3.3,
      marginRadius: 1.6, occlusalDepthLabial: 0.88, occlusalDepthLingual: 0.8, contourLabial: 4.4, contourLingual: 3.6,
      cusps: [
        { x: -3.2, z: 2.3, height: 0.8, radius: 1.6 },
        { x: 0.2, z: 2.6, height: 0.75, radius: 1.55 },
        { x: 3.6, z: 1.5, height: 0.5, radius: 1.35 },
        { x: -2.7, z: -2.6, height: 0.95, radius: 1.7 },
        { x: 2.3, z: -2.6, height: 0.85, radius: 1.65 },
      ],
      fossaDepth: 0.45,
    }),
  },
  m2: {
    width: 10.5,
    inclination: -14,
    angulation: 2,
    crown: molar({
      crownHeight: 6.1, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 5.25, halfWidthDistal: 5.25, contactLevel: 2.1, cervicalWidth: 0.82,
      halfDepthLabial: 4.9, halfDepthLingual: 5.0, cervicalDepth: 0.93, squareness: 3.3,
      marginRadius: 1.6, occlusalDepthLabial: 0.88, occlusalDepthLingual: 0.8, contourLabial: 4.1, contourLingual: 3.4,
      cusps: [
        { x: -2.7, z: 2.3, height: 0.75, radius: 1.6 },
        { x: 2.4, z: 2.3, height: 0.65, radius: 1.55 },
        { x: -2.4, z: -2.5, height: 0.9, radius: 1.65 },
        { x: 2.4, z: -2.4, height: 0.8, radius: 1.6 },
      ],
      fossaDepth: 0.4,
    }),
  },
};

const QUADRANT: ToothKey[] = ["central", "lateral", "canine", "pm1", "pm2", "m1", "m2"];

/**
 * An arch, as the curve through the crown centres: its tangent turns from
 * across the face (at the midline) to almost straight back (the molars),
 * `turn(s) = maxTurn · (1 − e^−(s/reach)^shape)` at arc length `s` from the
 * midline. Fitted on real arches with these crown widths: upper canines
 * ~34 mm apart and first molars ~49 mm, ~28 mm behind the incisors; lower
 * canines ~27 mm apart, first molars ~45 mm, ~26 mm behind.
 */
interface ArchCurve {
  maxTurn: number;
  reach: number;
  shape: number;
  /** Where the curve crosses the midline (z), mm. */
  front: number;
}
const UPPER_CURVE: ArchCurve = { maxTurn: 1.595, reach: 30.25, shape: 1.45, front: 0 };
/** The lower incisors sit a little behind the upper ones, as they do with the mouth slightly open. */
const LOWER_CURVE: ArchCurve = { maxTurn: 1.545, reach: 26.5, shape: 1.45, front: -1.6 };

/** Where an arch is at `s` mm from the midline (patient's left side, x ≥ 0), and how far its tangent has turned. */
function archPoint(c: ArchCurve, s: number): { x: number; z: number; turn: number } {
  const steps = Math.max(1, Math.ceil(s / 0.05));
  const ds = s / steps;
  const turnAt = (t: number) => c.maxTurn * (1 - Math.exp(-Math.pow(t / c.reach, c.shape)));
  let x = 0,
    z = c.front;
  for (let i = 0; i < steps; i++) {
    const t = turnAt((i + 0.5) * ds); // midpoint rule
    x += Math.cos(t) * ds;
    z -= Math.sin(t) * ds;
  }
  return { x, z, turn: turnAt(s) };
}

const smoothstep = (e0: number, e1: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * The height of each arch's biting edges: the mouth slightly open, ~2.7 mm
 * between the incisors closing to ~1.2 mm between the molars, the way a jaw
 * hinged behind the teeth opens.
 */
const upperBite = (s: number) => 1.35 - 0.35 * smoothstep(20, 50, s);
const lowerBite = (s: number) => -1.35 + 1.15 * smoothstep(14, 50, s);

type V3 = [number, number, number];
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const vec = (a: V3): Vec3 => ({ x: a[0], y: a[1], z: a[2] });

/** One tooth of the dentition: what it looks like, where it stands, and its frame for seating pieces. */
export interface SmileTooth {
  fdi: string;
  lower: boolean;
  crown: CrownParams;
  placement: CrownPlacement;
  frame: CrownFrame;
}

function layArch(lower: boolean): SmileTooth[] {
  const designs = lower ? LOWER : UPPER;
  const curve = lower ? LOWER_CURVE : UPPER_CURVE;
  const bite = lower ? lowerBite : upperBite;
  const out: SmileTooth[] = [];
  let travelled = 0;
  for (const [i, key] of QUADRANT.entries()) {
    const d = designs[key];
    const s = travelled + d.width / 2;
    travelled += d.width;
    const at = archPoint(curve, s);
    for (const side of [-1, 1] as const) {
      // side −1: the patient's right (viewer's left), quadrants 1 and 4; +1: the patient's left.
      const fdi = `${lower ? (side < 0 ? 4 : 3) : side < 0 ? 1 : 2}${i + 1}`;
      const distal: V3 = [side * Math.cos(at.turn), 0, -Math.sin(at.turn)];
      const outward: V3 = [side * Math.sin(at.turn), 0, Math.cos(at.turn)];
      const root: V3 = [0, lower ? -1 : 1, 0];
      // Lean the crown: its biting end out of the arch by `inclination`, toward the midline by `angulation`.
      const inc = (d.inclination * Math.PI) / 180;
      const ang = (d.angulation * Math.PI) / 180;
      let yAxis = add(scale(root, Math.cos(inc)), outward, -Math.sin(inc));
      const zAxis = add(scale(root, Math.sin(inc)), outward, Math.cos(inc));
      let xAxis = distal;
      [xAxis, yAxis] = [add(scale(xAxis, Math.cos(ang)), yAxis, -Math.sin(ang)), add(scale(yAxis, Math.cos(ang)), xAxis, Math.sin(ang))];
      // The visible crown runs from the cusp tips (or the edge, crown y = −reach) to the gum line
      // (crown y = crownHeight): the tips on the bite height, the crown's middle over the arch.
      const reach = cuspReach(d.crown);
      const mid = (d.crown.crownHeight - reach) / 2;
      const tipLevel = bite(s);
      const origin: V3 = [side * at.x - yAxis[0] * mid, tipLevel + yAxis[1] * reach, at.z - yAxis[2] * mid];
      const center = add(origin, yAxis, mid);
      const tangent: V3 = side < 0 ? scale(distal, -1) : distal; // toward the patient's left, on both sides
      const gumLevel = tipLevel + yAxis[1] * (d.crown.crownHeight + reach);
      out.push({
        fdi,
        lower,
        crown: d.crown,
        placement: { origin, xAxis, yAxis, zAxis },
        frame: {
          fdi,
          lower,
          center: vec(center),
          outward: vec(outward),
          tangent: vec(tangent),
          // along the arch: the mesial side faces the midline
          alongMinus: side < 0 ? d.crown.halfWidthDistal : d.crown.halfWidthMesial,
          alongPlus: side < 0 ? d.crown.halfWidthMesial : d.crown.halfWidthDistal,
          bottom: Math.min(tipLevel, gumLevel),
          top: Math.max(tipLevel, gumLevel),
          halfDepth: (d.crown.halfDepthLabial + d.crown.halfDepthLingual) / 2,
        },
      });
    }
  }
  const order = lower ? LOWER_TEETH : UPPER_TEETH;
  return out.sort((a, b) => order.indexOf(a.fdi) - order.indexOf(b.fdi));
}

/** Every tooth of the dentition, upper arch then lower, each in reading order (distal right → distal left). */
export const SMILE_TEETH: SmileTooth[] = [...layArch(false), ...layArch(true)];

/** The crowns' frames, for seating pieces (the same shape as the scan's calibration, `DENTITION_CROWNS`). */
export const SMILE_CROWNS: CrownFrame[] = SMILE_TEETH.map((t) => t.frame);

/** The tooth type of a crown of this dentition. */
export function smileToothKey(fdi: string): ToothKey | null {
  return toothKeys(fdi)?.tooth ?? null;
}

/** Every crown as a mesh, in world units. */
export function buildSmileMeshes(res: CrownResolution = DEFAULT_CROWN_RESOLUTION): { fdi: string; lower: boolean; mesh: CrownMesh }[] {
  return SMILE_TEETH.map((t) => ({ fdi: t.fdi, lower: t.lower, mesh: buildCrown(t.crown, t.placement, res) }));
}
