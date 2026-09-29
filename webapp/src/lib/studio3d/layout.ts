/** Pure helpers behind the editor's layout tools (see the engine's align and centre commands). */

export interface LevelItem {
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
 * The across position (world X, left–right as seen from the front) each
 * piece is aligned to: a single vertical line for the whole selection, both
 * arches included, midway between the leftmost and the rightmost piece.
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
