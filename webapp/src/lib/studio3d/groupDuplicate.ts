/**
 * Duplicating several pieces at once keeps their shape: the copies move as one
 * rigid group, and a spot is taken only when every copy fits there. This module
 * holds the pure part — the group's extent and the spots tried, in order —; the
 * engine snaps each copy onto the enamel and checks collisions.
 */
import { LOWER_ARCH, UPPER_ARCH } from "./dentition";

/** One piece of the group, in its anchor crown's frame: across the arch, up, and how far its outline reaches. */
export interface GroupPiece {
  along: number;
  up: number;
  reach: number;
}

/** The group's outline, from its centre, in the anchor crown's frame. */
export interface GroupBox {
  minAlong: number;
  maxAlong: number;
  minUp: number;
  maxUp: number;
}

/**
 * Where the copied group is tried: the same seat on another crown (`tooth`),
 * or the same crown, the whole group shifted across (`along`) and up (`up`).
 */
export type GroupMove = { kind: "tooth"; toothId: string } | { kind: "shift"; along: number; up: number };

/** Room left between the group and its copy, in world units (~mm): the copies sit close, never touching. */
export const GROUP_COPY_GAP = 0.2;

export function groupBox(pieces: readonly GroupPiece[]): GroupBox {
  let minAlong = Infinity,
    maxAlong = -Infinity,
    minUp = Infinity,
    maxUp = -Infinity;
  for (const p of pieces) {
    minAlong = Math.min(minAlong, p.along - p.reach);
    maxAlong = Math.max(maxAlong, p.along + p.reach);
    minUp = Math.min(minUp, p.up - p.reach);
    maxUp = Math.max(maxUp, p.up + p.reach);
  }
  if (!pieces.length) return { minAlong: 0, maxAlong: 0, minUp: 0, maxUp: 0 };
  return { minAlong, maxAlong, minUp, maxUp };
}

/** The crown `steps` places along its arch (toward the patient's left when positive), or null past the arch's end or off the arches. */
export function archNeighbour(toothId: string, steps: number): string | null {
  for (const arch of [UPPER_ARCH, LOWER_ARCH]) {
    const i = arch.indexOf(toothId);
    if (i < 0) continue;
    return arch[i + steps] ?? null;
  }
  return null;
}

/** Toward the midline along the arch: +1 for a crown on the patient's right (17…11, 47…41), -1 on the left. Null off the arches. */
function towardMidline(toothId: string): 1 | -1 | null {
  for (const arch of [UPPER_ARCH, LOWER_ARCH]) {
    const i = arch.indexOf(toothId);
    if (i >= 0) return i < arch.length / 2 ? 1 : -1;
  }
  return null;
}

export interface GroupMoveOptions {
  /** Which way across the crown has more room (toward the crown's middle), tried first. */
  alongRoom: 1 | -1;
  /** Which way up the crown has more room, tried first. */
  upRoom: 1 | -1;
  gap?: number;
}

/**
 * The spots tried for a copied group, best first:
 * 1. the same seat on the next crown (toward the midline first), so a row on a
 *    crown is repeated on its neighbour;
 * 2. the same crown, the line carried on (a row beside itself, a column above
 *    or below itself), then the group set parallel to itself (a row above or
 *    below, a column beside);
 * 3. crowns two and three places away.
 * A group as wide as it is tall counts as a row.
 */
export function groupDuplicateMoves(anchorToothId: string, box: GroupBox, opts: GroupMoveOptions): GroupMove[] {
  const gap = opts.gap ?? GROUP_COPY_GAP;
  const width = box.maxAlong - box.minAlong;
  const height = box.maxUp - box.minUp;
  const row = width >= height;
  const moves: GroupMove[] = [];
  const mid = towardMidline(anchorToothId);
  const crowns = (steps: number) => {
    if (mid == null) return;
    for (const dir of [mid, -mid]) {
      const toothId = archNeighbour(anchorToothId, dir * steps);
      if (toothId) moves.push({ kind: "tooth", toothId });
    }
  };
  const across = (sign: number) => moves.push({ kind: "shift", along: sign * (width + gap), up: 0 });
  const upDown = (sign: number) => moves.push({ kind: "shift", along: 0, up: sign * (height + gap) });

  crowns(1);
  const first = row ? across : upDown;
  const second = row ? upDown : across;
  const firstRoom = row ? opts.alongRoom : opts.upRoom;
  const secondRoom = row ? opts.upRoom : opts.alongRoom;
  first(firstRoom);
  first(-firstRoom);
  second(secondRoom);
  second(-secondRoom);
  crowns(2);
  crowns(3);
  return moves;
}
