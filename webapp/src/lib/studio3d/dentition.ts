import { toothKeys, type ToothKey, type Vec3 } from "../../data/studioEditor";

/**
 * The reference anatomy: where each crown of a real adult dentition sits,
 * both arches in occlusion — the calibration of the scan the Studio opened
 * on until 2026-11-17 (`dentition.glb`, since replaced by the procedural
 * dentition of `smileDentition.ts`; the file is in the repository's history).
 *
 * It stays for two things, both pure numbers:
 * - the try-on fits this dentition's front projection onto a photo
 *   (`frontView.ts`, `tryOnRegistration.ts`): real crown widths, heights and
 *   positions, measured on the scan;
 * - designs saved on the scan (`model: "dentition"`) are read in these
 *   frames — the seat of each piece on its tooth — and re-seated on the
 *   Studio's dentition when they open.
 *
 * Measured on horizontal slices and front / side views of the scan, in its
 * own coordinates, then brought to the Studio's world (millimetres).
 */

/** How the scan sat in the Studio's world: `world = (model - origin) * scale`. */
const SCAN_FIT = {
  /** World units (mm) per model unit: the scan's upper central incisors are ~8.5 mm wide. */
  scale: 810,
  /** Model point placed at the world origin: the midline, on the occlusal plane, just behind the front teeth. */
  origin: { x: 0.003, y: 0.034, z: 0.049 },
} as const;

/** Crown centres (middle of the crown, in the scan's own units). */
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

/** Crown height on the labial side (scan units): occlusal edge to gum line. */
const CROWN_BAND: Record<"upper" | "lower", Record<"anterior" | "posterior", [bottom: number, top: number]>> = {
  upper: { anterior: [0.0331, 0.0453], posterior: [0.0333, 0.0441] },
  lower: { anterior: [0.0228, 0.0337], posterior: [0.026, 0.0348] },
};

/** Half the labio-lingual depth of a crown, in millimetres, by tooth type. */
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

/** How far the last crown of an arch reaches toward the back, in millimetres. */
const DISTAL_REACH = 14;

/**
 * One crown, in world units: the frame a piece's seat on its tooth is
 * measured in (across: `tangent`, up: world y). Shared by this reference
 * anatomy and the Studio's dentition (`SMILE_CROWNS`).
 */
export interface CrownFrame {
  fdi: string;
  lower: boolean;
  /** Middle of the visible crown. */
  center: Vec3;
  /** Horizontal, away from the tongue: the labial / buccal direction. */
  outward: Vec3;
  /** Horizontal, along the arch toward the patient's left. */
  tangent: Vec3;
  /** Extent along the arch toward the patient's right (`-`) and left (`+`). */
  alongMinus: number;
  alongPlus: number;
  /** The visible crown's height, as world y: biting edge to gum line. */
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
  const { scale, origin } = SCAN_FIT;
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
    const key = toothKeys(fdi)!.tooth;
    const anterior = key === "central" || key === "lateral" || key === "canine";
    const [bottom, top] = CROWN_BAND[lower ? "lower" : "upper"][anterior ? "anterior" : "posterior"];
    const { scale, origin } = SCAN_FIT;
    return {
      fdi,
      lower,
      center: { x: c.x, y: ((bottom + top) / 2 - origin.y) * scale, z: c.z },
      outward,
      tangent,
      alongMinus: half(prev),
      alongPlus: half(next),
      bottom: (bottom - origin.y) * scale,
      top: (top - origin.y) * scale,
      halfDepth: CROWN_HALF_DEPTH[key],
    };
  });
}

/** Every crown of the reference anatomy, upper arch then lower arch. */
export const DENTITION_CROWNS: CrownFrame[] = [...archFrames(UPPER_ARCH, false), ...archFrames(LOWER_ARCH, true)];
