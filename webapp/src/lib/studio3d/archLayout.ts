import { QUADRANT_TEETH, TOOTH_SPECS, type ToothSpec, type Vec3 } from "../../data/studioEditor";
import { ARCH_K, seeded, xForArc } from "./math";

/**
 * The reference arch as plain numbers: where each tooth of the Studio's own
 * dentition sits, which way its labial face looks, and which way the arch
 * runs past it.
 *
 * Pure (no three.js), so the engine builds its teeth from it and the saved
 * designs' 2D previews draw the very same arch without a WebGL context.
 */

export interface ToothFrame {
  fdi: string;
  spec: ToothSpec;
  /** Full mesiodistal crown width, in millimetres. */
  width: number;
  center: Vec3;
  /** Unit vector out of the labial face, horizontal. */
  outward: Vec3;
  /** Unit vector along the arch, horizontal; points to the viewer's right on both sides. */
  tangent: Vec3;
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Every tooth of the upper arch, midline → distal, right side first for each tooth type (the engine's build order). */
export const ARCH_FRAMES: ToothFrame[] = (() => {
  const out: ToothFrame[] = [];
  let cum = 0;
  for (const t of QUADRANT_TEETH) {
    const centerS = cum + t.w / 2;
    cum += t.w;
    for (const side of [-1, 1] as const) {
      const fdi = side < 0 ? t.fdiR : t.fdiL;
      const x = xForArc(centerS) * side;
      const z = -(x * x) / ARCH_K;
      const outward = norm({ x: (2 * x) / ARCH_K, y: 0, z: 1 });
      out.push({
        fdi,
        spec: TOOTH_SPECS[t.key],
        width: t.w,
        center: { x, y: (seeded(fdi, 4) - 0.5) * 0.8, z },
        outward,
        tangent: { x: outward.z, y: 0, z: -outward.x },
      });
    }
  }
  return out;
})();

export const ARCH_FRAME_BY_ID: Record<string, ToothFrame> = Object.fromEntries(ARCH_FRAMES.map((f) => [f.fdi, f]));

/**
 * Approximate point on a tooth's labial face, `u` across (-1..1) and `v` up
 * (-1 incisal .. 1 cervical), with the face's outward normal.
 *
 * Close to, not exactly on, the enamel: good for a 2D preview and for seeding
 * a design, which the engine re-seats onto the real surface when it loads.
 */
export function approxLabialPoint(fdi: string, u: number, v: number): { position: Vec3; normal: Vec3 } | null {
  const f = ARCH_FRAME_BY_ID[fdi];
  if (!f) return null;
  const across = u * f.spec.wHalf * 0.6;
  const up = v * f.spec.hHalf * 0.5;
  const out = f.spec.dHalf;
  return {
    position: {
      x: f.center.x + f.tangent.x * across + f.outward.x * out,
      y: f.center.y + up,
      z: f.center.z + f.tangent.z * across + f.outward.z * out,
    },
    normal: { ...f.outward },
  };
}
