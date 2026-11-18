import type { Vec3 } from "../../data/studioEditor";

/**
 * Opening the mouth on the Studio's dentition (`smileDentition.ts`): the
 * lower arch (and the pieces on it) swings down around a hinge where the
 * jaw's joints would be, behind and above the teeth, gliding slightly forward
 * as it opens wide — the way a jaw moves, not a box lid. The upper arch never moves.
 *
 * Pure numbers in world millimetres (the origin is the midline between the
 * two arches, at the upper central incisors; +z toward the lips, +y up), so
 * the motion is testable without three.js. Only a view: the openness lives in
 * the engine, never in the design or a saved scene.
 */
export const JAW_HINGE = {
  /** The hinge axis runs left–right (x) through this point. */
  pivot: { x: 0, y: 18, z: -80 } as Vec3,
  /** Rotation when wide open, in radians: about 18 mm between the front teeth (a relaxed, talking opening). */
  maxAngle: (12 * Math.PI) / 180,
  /** Forward glide when wide open, in millimetres (grows late in the opening, as the joints slide). */
  glide: 1.5,
} as const;

/** Timings of the open-and-close loop, in milliseconds. */
export const MOUTH_LOOP = { open: 1100, hold: 650, close: 950, rest: 900 } as const;
/** One opening or closing asked from the button, in milliseconds. */
export const MOUTH_TWEEN_MS = 950;

/** Where the jaw is for an openness from 0 (closed) to 1 (wide open). */
export function jawPose(openness: number): { angle: number; glide: number } {
  const t = Math.min(1, Math.max(0, openness));
  return { angle: JAW_HINGE.maxAngle * t, glide: JAW_HINGE.glide * t * t };
}

/** A point of the lower arch, closed, moved to where it is at this openness. */
export function moveWithJaw(p: Vec3, openness: number): Vec3 {
  const { angle, glide } = jawPose(openness);
  const { pivot } = JAW_HINGE;
  const dy = p.y - pivot.y,
    dz = p.z - pivot.z;
  // Rotation about +x: the front (+z of the hinge) goes down.
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: p.x, y: pivot.y + dy * c - dz * s, z: pivot.z + dy * s + dz * c + glide };
}

/** Slow in, slow out: a jaw speeds up and settles, it never snaps. */
export function easeJaw(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

/** The openness `elapsed` ms into the loop: open, hold, close, rest, again. */
export function loopOpenness(elapsed: number): number {
  const { open, hold, close, rest } = MOUTH_LOOP;
  const period = open + hold + close + rest;
  const t = ((elapsed % period) + period) % period;
  if (t < open) return easeJaw(t / open);
  if (t < open + hold) return 1;
  if (t < open + hold + close) return 1 - easeJaw((t - open - hold) / close);
  return 0;
}
