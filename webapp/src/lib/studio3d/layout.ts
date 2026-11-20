/** Pure helpers behind the editor's layout tools (see the engine's align and centre commands). */

interface LevelItem {
  id: string;
  /** Height of the piece on the enamel (world Y). */
  y: number;
  /** On the lower arch: its pieces line up among themselves, never with the upper arch's. */
  lower: boolean;
}

/**
 * The height each piece is aligned to: one horizontal line per arch, midway
 * between that arch's highest and lowest selected piece. An arch holding a
 * single selected piece has nothing to line it up with, so it is left out.
 */
export function alignedHeights(items: LevelItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const lower of [false, true]) {
    const arch = items.filter((i) => i.lower === lower);
    if (arch.length < 2) continue;
    const ys = arch.map((i) => i.y);
    const target = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const i of arch) out.set(i.id, target);
  }
  return out;
}

/**
 * The left–right position on screen each piece is aligned to: a single
 * vertical line for the whole selection, both arches included, midway
 * between the leftmost and the rightmost piece.
 */
export function alignedColumn(items: { id: string; x: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  if (items.length < 2) return out;
  const xs = items.map((i) => i.x);
  const target = (Math.min(...xs) + Math.max(...xs)) / 2;
  for (const i of items) out.set(i.id, target);
  return out;
}

export interface CenterItem {
  id: string;
  toothId: string;
  /** Distance from the middle of the tooth, across it (along the arch). */
  offset: number;
}

/**
 * Where each piece sits across its tooth once centred. A piece alone on its
 * tooth goes to the middle; pieces sharing a tooth are centred as a cluster,
 * keeping their spacing, so they never pile up on the same spot.
 */
export function centeredOffsets(items: CenterItem[]): Map<string, number> {
  const byTooth = new Map<string, CenterItem[]>();
  for (const i of items) byTooth.set(i.toothId, [...(byTooth.get(i.toothId) ?? []), i]);
  const out = new Map<string, number>();
  for (const cluster of byTooth.values()) {
    const mean = cluster.reduce((s, i) => s + i.offset, 0) / cluster.length;
    for (const i of cluster) out.set(i.id, i.offset - mean);
  }
  return out;
}

/** A tooth's centre, by FDI number (`"11"` … `"48"`). */
export interface ToothCentre {
  id: string;
  x: number;
  y: number;
  z: number;
}

/**
 * How far along its own arch each tooth's centre lies from the midline, from
 * the crowns as they stand: half the gap between the two central incisors of
 * that arch, then the distance from each crown's centre to the next one's.
 * "Space evenly" reads its positions from it, so each arch is measured with
 * its own teeth (the lower incisors are much narrower than the upper ones).
 * A quadrant's run stops at a missing tooth; the teeth past it are left out.
 */
export function archDistances(teeth: ToothCentre[]): Map<string, number> {
  const byId = new Map(teeth.map((t) => [t.id, t]));
  const out = new Map<string, number>();
  const gap = (a: ToothCentre, b: ToothCentre) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  for (const [quadrant, partner] of [
    ["1", "2"],
    ["2", "1"],
    ["3", "4"],
    ["4", "3"],
  ]) {
    const central = byId.get(`${quadrant}1`);
    if (!central) continue;
    const across = byId.get(`${partner}1`);
    let run = across ? gap(central, across) / 2 : Math.abs(central.x);
    out.set(central.id, run);
    let previous = central;
    for (let n = 2; n <= 8; n++) {
      const tooth = byId.get(`${quadrant}${n}`);
      if (!tooth) break;
      run += gap(previous, tooth);
      out.set(tooth.id, run);
      previous = tooth;
    }
  }
  return out;
}
