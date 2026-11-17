import { LOWER_TEETH, UPPER_TEETH, toothKeys, type ToothKey, type Vec3 } from "../../data/studioEditor";
import {
  buildCrown,
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
 * gum or socle, the lips apart in a smile — the brand's reference smile,
 * made as real as a dentition is.
 *
 * The incisors keep the reference drawing's look (broad blades with rounded
 * corners above, narrow shields below, domed where the gum would be). The
 * canines, premolars and molars are shaped like real ones — a pointed cusp,
 * an occlusal table carved round its cusps — with broad, gently curved
 * labial faces a gem can sit on, where the drawing had rounded pills. Like
 * a real smile, the crowns stand upright and touch their neighbours, the
 * upper laterals a little shorter than the centrals, the arches just apart.
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
  /** How far the biting end stops short of the arch's biting line, toward the root, mm (the upper laterals). */
  shorter?: number;
}

/*
 * Average adult crowns (Wheeler's tables, rounded; the lower incisors at the
 * broad end of the range, as the drawing has them). The visible crown runs
 * from the edge or the cusp tips to the gum line; the dome above it stands
 * for the gum, as on the drawing. A premolar's or molar's cusp tips stand
 * level with its occlusal margin, the table carved below them.
 */
const UPPER: Record<ToothKey, ToothDesign> = {
  central: {
    width: 8.6,
    inclination: 10,
    angulation: 0,
    crown: incisor({
      crownHeight: 9.6, domeHeight: 3.2, domeRoundness: 2,
      halfWidthMesial: 4.3, halfWidthDistal: 4.3, contactLevel: 2.6, cervicalWidth: 0.86,
      halfDepthLabial: 3.0, halfDepthLingual: 3.5, cervicalDepth: 0.92, squareness: 2.6,
      cornerMesial: 1.0, cornerDistal: 1.8, edgeRadius: 0.35, slopeLabial: 0.42, slopeLingual: 0.62,
    }),
  },
  lateral: {
    width: 6.6,
    inclination: 9,
    angulation: 0,
    shorter: 0.6,
    crown: incisor({
      crownHeight: 8.6, domeHeight: 2.9, domeRoundness: 1.9,
      halfWidthMesial: 3.3, halfWidthDistal: 3.3, contactLevel: 2.3, cervicalWidth: 0.85,
      halfDepthLabial: 2.7, halfDepthLingual: 3.1, cervicalDepth: 0.92, squareness: 2.5,
      cornerMesial: 1.0, cornerDistal: 2.0, edgeRadius: 0.33, slopeLabial: 0.42, slopeLingual: 0.6,
    }),
  },
  canine: {
    width: 7.6,
    inclination: 4,
    angulation: 2,
    crown: canine({
      crownHeight: 9.8, domeHeight: 2.9, domeRoundness: 1.9,
      halfWidthMesial: 3.8, halfWidthDistal: 3.8, contactLevel: 3.6, cervicalWidth: 0.84,
      halfDepthLabial: 3.7, halfDepthLingual: 4.0, cervicalDepth: 0.9, squareness: 2.6,
      slopeMesial: 1.5, slopeDistal: 1.1, slopeLabial: 1.25, slopeLingual: 1.15, tipRadius: 0.55,
    }),
  },
  pm1: {
    width: 7.0,
    inclination: 0,
    angulation: 0,
    crown: premolar({
      crownHeight: 8.5, domeHeight: 2.4, domeRoundness: 2,
      halfWidthMesial: 3.5, halfWidthDistal: 3.5, contactLevel: 2.9, cervicalWidth: 0.82,
      halfDepthLabial: 4.5, halfDepthLingual: 4.4, cervicalDepth: 0.93, squareness: 3.0,
      marginRadius: 1.5, occlusalDepthLabial: 0.86, occlusalDepthLingual: 0.76, contourLabial: 5.8, contourLingual: 4.2,
      cusps: [
        { x: -0.2, z: 1.9, height: 0.75, radius: 1.5 },
        { x: 0.2, z: -1.6, height: 0.5, radius: 1.4 },
      ],
      fossaDepth: 0.3,
    }),
  },
  pm2: {
    width: 6.7,
    inclination: 0,
    angulation: 0,
    crown: premolar({
      crownHeight: 8.0, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 3.35, halfWidthDistal: 3.35, contactLevel: 2.8, cervicalWidth: 0.82,
      halfDepthLabial: 4.5, halfDepthLingual: 4.4, cervicalDepth: 0.93, squareness: 3.0,
      marginRadius: 1.5, occlusalDepthLabial: 0.86, occlusalDepthLingual: 0.78, contourLabial: 5.5, contourLingual: 4.0,
      cusps: [
        { x: 0, z: 1.9, height: 0.6, radius: 1.6 },
        { x: 0, z: -1.7, height: 0.5, radius: 1.5 },
      ],
      fossaDepth: 0.25,
    }),
  },
  m1: {
    width: 10.2,
    inclination: 3,
    angulation: 0,
    crown: molar({
      crownHeight: 7.5, domeHeight: 2.4, domeRoundness: 2,
      halfWidthMesial: 5.1, halfWidthDistal: 5.1, contactLevel: 2.8, cervicalWidth: 0.84,
      halfDepthLabial: 5.4, halfDepthLingual: 5.6, cervicalDepth: 0.93, squareness: 3.1,
      marginRadius: 1.8, occlusalDepthLabial: 0.88, occlusalDepthLingual: 0.8, contourLabial: 5.3, contourLingual: 3.8,
      cusps: [
        { x: -2.1, z: 1.9, height: 0.7, radius: 1.5 },
        { x: 2.1, z: 1.9, height: 0.6, radius: 1.45 },
        { x: -1.8, z: -1.8, height: 0.75, radius: 1.7 },
        { x: 2.2, z: -1.7, height: 0.45, radius: 1.35 },
      ],
      fossaDepth: 0.4,
    }),
  },
  m2: {
    width: 9.2,
    inclination: 3,
    angulation: 0,
    crown: molar({
      crownHeight: 7.0, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 4.6, halfWidthDistal: 4.6, contactLevel: 2.6, cervicalWidth: 0.84,
      halfDepthLabial: 5.4, halfDepthLingual: 5.4, cervicalDepth: 0.93, squareness: 3.1,
      marginRadius: 1.75, occlusalDepthLabial: 0.88, occlusalDepthLingual: 0.8, contourLabial: 5.0, contourLingual: 3.6,
      cusps: [
        { x: -1.8, z: 1.9, height: 0.65, radius: 1.45 },
        { x: 1.7, z: 1.8, height: 0.5, radius: 1.35 },
        { x: -1.4, z: -1.8, height: 0.7, radius: 1.6 },
        { x: 1.9, z: -1.6, height: 0.3, radius: 1.25 },
      ],
      fossaDepth: 0.35,
    }),
  },
};

const LOWER: Record<ToothKey, ToothDesign> = {
  central: {
    width: 5.8,
    inclination: 4,
    angulation: 0,
    crown: incisor({
      crownHeight: 8.2, domeHeight: 2.8, domeRoundness: 1.85,
      halfWidthMesial: 2.9, halfWidthDistal: 2.9, contactLevel: 1.8, cervicalWidth: 0.8,
      halfDepthLabial: 2.6, halfDepthLingual: 3.1, cervicalDepth: 0.92, squareness: 2.5,
      cornerMesial: 0.55, cornerDistal: 0.7, edgeRadius: 0.3, slopeLabial: 0.36, slopeLingual: 0.52,
    }),
  },
  lateral: {
    width: 6.2,
    inclination: 4,
    angulation: 0,
    crown: incisor({
      crownHeight: 8.5, domeHeight: 2.8, domeRoundness: 1.85,
      halfWidthMesial: 3.1, halfWidthDistal: 3.1, contactLevel: 1.9, cervicalWidth: 0.8,
      halfDepthLabial: 2.7, halfDepthLingual: 3.2, cervicalDepth: 0.92, squareness: 2.5,
      cornerMesial: 0.6, cornerDistal: 0.95, edgeRadius: 0.3, slopeLabial: 0.36, slopeLingual: 0.52,
    }),
  },
  canine: {
    width: 7.0,
    inclination: 2,
    angulation: 1,
    crown: canine({
      crownHeight: 10.0, domeHeight: 2.8, domeRoundness: 1.8,
      halfWidthMesial: 3.5, halfWidthDistal: 3.5, contactLevel: 3.0, cervicalWidth: 0.8,
      halfDepthLabial: 3.4, halfDepthLingual: 3.8, cervicalDepth: 0.9, squareness: 2.6,
      slopeMesial: 1.7, slopeDistal: 1.2, slopeLabial: 1.2, slopeLingual: 1.1, tipRadius: 0.5,
    }),
  },
  pm1: {
    width: 7.0,
    inclination: -6,
    angulation: 0,
    crown: premolar({
      crownHeight: 8.5, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 3.5, halfWidthDistal: 3.5, contactLevel: 2.9, cervicalWidth: 0.8,
      halfDepthLabial: 3.9, halfDepthLingual: 3.6, cervicalDepth: 0.93, squareness: 3.0,
      marginRadius: 1.4, occlusalDepthLabial: 0.86, occlusalDepthLingual: 0.66, contourLabial: 5.8, contourLingual: 4.6,
      cusps: [
        { x: -0.1, z: 0.9, height: 0.75, radius: 1.5 },
        { x: 0.2, z: -1.5, height: 0.25, radius: 1.1 },
      ],
      fossaDepth: 0.2,
    }),
  },
  pm2: {
    width: 7.1,
    inclination: -8,
    angulation: 0,
    crown: premolar({
      crownHeight: 8.0, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 3.55, halfWidthDistal: 3.55, contactLevel: 2.8, cervicalWidth: 0.82,
      halfDepthLabial: 4.1, halfDepthLingual: 4.0, cervicalDepth: 0.93, squareness: 3.0,
      marginRadius: 1.45, occlusalDepthLabial: 0.86, occlusalDepthLingual: 0.72, contourLabial: 5.5, contourLingual: 4.4,
      cusps: [
        { x: 0, z: 1.1, height: 0.6, radius: 1.6 },
        { x: -0.9, z: -1.5, height: 0.4, radius: 1.2 },
        { x: 1.1, z: -1.4, height: 0.3, radius: 1.1 },
      ],
      fossaDepth: 0.2,
    }),
  },
  m1: {
    width: 11.0,
    inclination: -12,
    angulation: 0,
    crown: molar({
      crownHeight: 7.5, domeHeight: 2.4, domeRoundness: 2,
      halfWidthMesial: 5.5, halfWidthDistal: 5.5, contactLevel: 2.9, cervicalWidth: 0.84,
      halfDepthLabial: 5.0, halfDepthLingual: 5.2, cervicalDepth: 0.93, squareness: 3.1,
      marginRadius: 1.7, occlusalDepthLabial: 0.88, occlusalDepthLingual: 0.82, contourLabial: 5.2, contourLingual: 4.4,
      cusps: [
        { x: -2.8, z: 1.6, height: 0.55, radius: 1.45 },
        { x: 0.2, z: 1.8, height: 0.5, radius: 1.4 },
        { x: 3.0, z: 1.0, height: 0.35, radius: 1.2 },
        { x: -2.4, z: -1.8, height: 0.65, radius: 1.55 },
        { x: 2.0, z: -1.8, height: 0.6, radius: 1.5 },
      ],
      fossaDepth: 0.35,
    }),
  },
  m2: {
    width: 10.5,
    inclination: -14,
    angulation: 0,
    crown: molar({
      crownHeight: 7.0, domeHeight: 2.3, domeRoundness: 2,
      halfWidthMesial: 5.25, halfWidthDistal: 5.25, contactLevel: 2.7, cervicalWidth: 0.84,
      halfDepthLabial: 4.9, halfDepthLingual: 5.0, cervicalDepth: 0.93, squareness: 3.1,
      marginRadius: 1.7, occlusalDepthLabial: 0.88, occlusalDepthLingual: 0.82, contourLabial: 4.9, contourLingual: 4.2,
      cusps: [
        { x: -2.3, z: 1.6, height: 0.5, radius: 1.45 },
        { x: 2.1, z: 1.6, height: 0.45, radius: 1.4 },
        { x: -2.1, z: -1.7, height: 0.6, radius: 1.5 },
        { x: 2.1, z: -1.6, height: 0.55, radius: 1.45 },
      ],
      fossaDepth: 0.3,
    }),
  },
};

const QUADRANT: ToothKey[] = ["central", "lateral", "canine", "pm1", "pm2", "m1", "m2"];

/**
 * How far neighbouring crowns press into each other at their contact, mm:
 * real teeth touch over an area, not at a point, so two convex crowns laid
 * just edge to edge would leave a slit of light above and below the contact.
 */
const CONTACT_OVERLAP = 0.2;

/**
 * An arch, as the curve through the crown centres: its tangent turns from
 * across the face (at the midline) to almost straight back (the molars),
 * `turn(s) = maxTurn · (1 − e^−(s/reach)^shape)` at arc length `s` from the
 * midline. Fitted on real arches with these crown widths, a little broad so
 * the premolars show in the smile: upper canines ~33 mm apart and first
 * molars ~53 mm, ~26 mm behind the incisors; lower canines ~28 mm apart,
 * first molars ~48 mm.
 */
interface ArchCurve {
  maxTurn: number;
  reach: number;
  shape: number;
  /** Where the curve crosses the midline (z), mm. */
  front: number;
}
const UPPER_CURVE: ArchCurve = { maxTurn: 1.595, reach: 25.5, shape: 1.25, front: 0 };
/** The lower incisors sit a little behind the upper ones, as they do in a smile. */
const LOWER_CURVE: ArchCurve = { maxTurn: 1.53, reach: 21.5, shape: 1.3, front: -1.6 };

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

const smootherstep = (e0: number, e1: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * t * (t * (6 * t - 15) + 10);
};

/**
 * The height of each arch's biting edges: the lips apart in a smile, ~1.7 mm
 * between the incisors closing to ~1 mm between the molars, the way a jaw
 * hinged behind the teeth opens.
 */
const upperBite = (s: number) => 0.85 - 0.25 * smootherstep(20, 50, s);
const lowerBite = (s: number) => -0.85 + 0.5 * smootherstep(14, 50, s);

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
  // Along the arch from the midline: each crown takes its width, less the contact it shares.
  let travelled = -CONTACT_OVERLAP / 2;
  for (const [i, key] of QUADRANT.entries()) {
    const d = designs[key];
    const s = travelled + d.width / 2;
    travelled += d.width - CONTACT_OVERLAP;
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
      // The visible crown runs from the biting end (crown y = 0) to the gum line (crown y = crownHeight):
      // the biting end on the arch's biting line (or short of it), the crown's middle over the arch.
      const mid = d.crown.crownHeight / 2;
      const tipLevel = bite(s) + (lower ? -1 : 1) * (d.shorter ?? 0);
      const origin: V3 = [side * at.x - yAxis[0] * mid, tipLevel, at.z - yAxis[2] * mid];
      const center = add(origin, yAxis, mid);
      const tangent: V3 = side < 0 ? scale(distal, -1) : distal; // toward the patient's left, on both sides
      const gumLevel = tipLevel + yAxis[1] * d.crown.crownHeight;
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
