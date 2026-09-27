import { toothKeys, type ToothKey, type Vec3 } from "../../data/studioEditor";

/**
 * The Studio's default dentition: the `dentition.glb` scan, both arches in
 * occlusion on their socles, as one merged mesh.
 *
 * A merged mesh does not say where one tooth ends and the gum begins, so the
 * crowns are calibrated here, once, on the file itself: where each crown sits
 * on the arch and how high it rises. From that the engine knows which tooth a
 * point of the surface belongs to — or that it is gum, socle or anything else,
 * where no piece belongs.
 *
 * Pure numbers, no three.js: the classification is testable on its own.
 * Re-measure this table if the model file changes.
 *
 * The file in `assets/studio3d` is derived from the original scan
 * (14 MB, 500k triangles): the loose artefact in front of the lower socle
 * (the one detached mesh part) removed, then
 * `gltf-transform optimize --compress meshopt --simplify-ratio 0.3 --simplify-error 0.0005`
 * — about 1 MB and 140k triangles, in the scan's own coordinates, which this
 * table uses.
 */

/** How the file sits in the Studio's world: `world = (model - origin) * scale`. */
export const DENTITION_FIT = {
  /**
   * World units per model unit. The Studio's world unit is the millimetre (a
   * piece's `scale` is a real radius and drives the price bands), so the scan
   * is scaled until its upper central incisors are ~8.5 mm wide.
   */
  scale: 810,
  /** Model point placed at the world origin: the midline, on the occlusal plane, just behind the front teeth. */
  origin: { x: 0.003, y: 0.034, z: 0.049 },
} as const;

/** Crown centres (middle of the crown, in the model's own units), measured on horizontal slices of the file. */
const CROWN_CENTERS: Record<string, [x: number, z: number]> = {
  // upper arch, patient's right (viewer's left) then left
  "17": [-0.0325, 0.006],
  "16": [-0.0298, 0.019],
  "15": [-0.027, 0.0298],
  "14": [-0.0242, 0.0375],
  "13": [-0.0188, 0.0435],
  "12": [-0.0115, 0.0475],
  "11": [-0.0025, 0.0508],
  "21": [0.008, 0.0505],
  "22": [0.0158, 0.0448],
  "23": [0.023, 0.0395],
  "24": [0.027, 0.0298],
  "25": [0.0295, 0.0195],
  "26": [0.032, 0.0105],
  "27": [0.0335, -0.001],
  // lower arch, patient's right then left
  "47": [-0.0318, 0.0095],
  "46": [-0.03, 0.0175],
  "45": [-0.025, 0.0262],
  "44": [-0.0195, 0.036],
  "43": [-0.0135, 0.042],
  "42": [-0.007, 0.0442],
  "41": [-0.0005, 0.0445],
  "31": [0.0065, 0.0445],
  "32": [0.0127, 0.0435],
  "33": [0.0187, 0.04],
  "34": [0.0232, 0.032],
  "35": [0.026, 0.0245],
  "36": [0.029, 0.0178],
  "37": [0.0307, 0.0098],
};

/** Crown height on the labial side (model units): occlusal edge to gum line, measured on front and side views. */
const CROWN_BAND: Record<"upper" | "lower", Record<"anterior" | "posterior", [bottom: number, top: number]>> = {
  upper: { anterior: [0.0331, 0.0453], posterior: [0.0333, 0.0441] },
  lower: { anterior: [0.0228, 0.0337], posterior: [0.026, 0.0348] },
};

/** Half the labio-lingual depth of a crown, in world millimetres, by tooth type. */
const CROWN_HALF_DEPTH: Record<ToothKey, number> = {
  central: 3.4,
  lateral: 3.2,
  canine: 3.9,
  pm1: 4.3,
  pm2: 4.3,
  m1: 5.2,
  m2: 5.0,
};

/** The two arches in reading order along the arch, distal right → distal left. */
export const UPPER_ARCH = ["17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27"];
export const LOWER_ARCH = ["47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37"];

/**
 * How far the last crown of an arch reaches toward the back, in millimetres.
 * The scan carries a few more back crowns than the seven FDI numbers per
 * quadrant; they count as the last molar.
 */
const DISTAL_REACH = 14;

/** Slack around a crown, in millimetres, so a piece on the very edge of the enamel still counts as on it. */
const EDGE_SLACK = { along: 0.35, height: 0.5, depth: 1.6 };
/**
 * How far past the halfway point to a neighbour a crown may still claim a
 * point. Each crown measures along its own tangent, and around the arch's
 * curve those disagree; the overlap closes the gaps, and the nearest crown
 * settles the points both claim.
 */
const NEIGHBOUR_OVERLAP = 1.4;

/** One calibrated crown, in world units. */
export interface CrownFrame {
  fdi: string;
  lower: boolean;
  /** Middle of the crown. */
  center: Vec3;
  /** Horizontal, away from the tongue: the labial / buccal direction. */
  outward: Vec3;
  /** Horizontal, along the arch toward the patient's left. */
  tangent: Vec3;
  /** Extent along the arch toward the previous (`-`) and next (`+`) tooth: half the gap to each neighbour. */
  alongMinus: number;
  alongPlus: number;
  /** How far along the arch the crown claims points, each way (see `NEIGHBOUR_OVERLAP`). */
  reachMinus: number;
  reachPlus: number;
  /** Crown height on the labial side, as world y. */
  bottom: number;
  top: number;
  halfDepth: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm2 = (x: number, z: number): Vec3 => {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, y: 0, z: z / l };
};

function toWorld(x: number, y: number, z: number): Vec3 {
  const { scale, origin } = DENTITION_FIT;
  return { x: (x - origin.x) * scale, y: (y - origin.y) * scale, z: (z - origin.z) * scale };
}

function archFrames(arch: string[], lower: boolean): CrownFrame[] {
  const centers = arch.map((fdi) => {
    const [x, z] = CROWN_CENTERS[fdi];
    return toWorld(x, 0, z);
  });
  // The arch's inside: the mean of its crowns, where the tongue is.
  const inside = centers.reduce((s, c) => ({ x: s.x + c.x / centers.length, y: 0, z: s.z + c.z / centers.length }), { x: 0, y: 0, z: 0 });
  return arch.map((fdi, i) => {
    const c = centers[i];
    const prev = centers[i - 1];
    const next = centers[i + 1];
    // Tangent from neighbour to neighbour (one side only at the ends of the arch).
    const a = prev ?? c;
    const b = next ?? c;
    const tangent = norm2(b.x - a.x, b.z - a.z);
    let outward = norm2(tangent.z, -tangent.x);
    if (dot(outward, sub(c, inside)) < 0) outward = { x: -outward.x, y: 0, z: -outward.z };
    const half = (n: Vec3 | undefined) => (n ? Math.abs(dot(sub(n, c), tangent)) / 2 : DISTAL_REACH);
    const alongMinus = half(prev);
    const alongPlus = half(next);
    const reach = (n: Vec3 | undefined, h: number) => (n ? h * NEIGHBOUR_OVERLAP : h) + EDGE_SLACK.along;
    const key = toothKeys(fdi)!.tooth;
    const anterior = key === "central" || key === "lateral" || key === "canine";
    const [bottom, top] = CROWN_BAND[lower ? "lower" : "upper"][anterior ? "anterior" : "posterior"];
    const { scale, origin } = DENTITION_FIT;
    return {
      fdi,
      lower,
      center: { x: c.x, y: ((bottom + top) / 2 - origin.y) * scale, z: c.z },
      outward,
      tangent,
      alongMinus,
      alongPlus,
      reachMinus: reach(prev, alongMinus),
      reachPlus: reach(next, alongPlus),
      bottom: (bottom - origin.y) * scale,
      top: (top - origin.y) * scale,
      halfDepth: CROWN_HALF_DEPTH[key],
    };
  });
}

/** Every crown of the default dentition, upper arch then lower arch. */
export const DENTITION_CROWNS: CrownFrame[] = [...archFrames(UPPER_ARCH, false), ...archFrames(LOWER_ARCH, true)];

/**
 * The tooth a point of the dentition's surface belongs to, or `null` for
 * gum, socle and anything else that is not a crown. Where two crowns could
 * claim a point, the nearest one wins.
 */
export function crownAt(p: Vec3, crowns: CrownFrame[] = DENTITION_CROWNS): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of crowns) {
    if (p.y < c.bottom - EDGE_SLACK.height || p.y > c.top + EDGE_SLACK.height) continue;
    const rel = sub(p, c.center);
    const along = dot(rel, c.tangent);
    if (along < -c.reachMinus || along > c.reachPlus) continue;
    if (Math.abs(dot(rel, c.outward)) > c.halfDepth + EDGE_SLACK.depth) continue;
    const distance = Math.hypot(rel.x, rel.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = c.fdi;
    }
  }
  return best;
}
