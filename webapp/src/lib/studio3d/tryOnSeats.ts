import type { PlacedJewelry } from "../../data/studioEditor";
import type { SceneModel } from "../studioWorkspace/scene";
import { projectFrontView } from "./frontView";

/**
 * Where each gem sits on its tooth and how big it is against it, measured on
 * the Studio's front view (`frontView.ts`): sent with the smile try-on so the
 * AI reads the position and size in words, not only from the 3D render
 * (decision 111). The function puts them next to the gems it reads from the
 * database, by piece id; a number here only steers where a gem is drawn on
 * the requester's own render.
 *
 * Pure: no React, no DOM.
 */
export interface TryOnSeat {
  id: string;
  /** Centre height on the crown: 0 at the gum line, 1 at the biting edge. */
  gum: number;
  /** Centre across the crown, as a share of its width: 0 centred, > 0 toward the midline, < 0 toward the side. */
  mid: number;
  /** Longest side as a share of the crown's width seen from the front. */
  width: number;
  /** False: on the tongue side, hidden from the front. */
  front: boolean;
  /**
   * The gem's name on the flat map and in the design data: its tooth and a
   * letter, from the gum side ("11a" nearest the gum line, then "11b"…).
   * Front gems only.
   */
  tag?: string;
}

const round = (n: number) => Math.round(n * 100) / 100;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * Tag the front gems tooth by tooth: nearest the gum line first, ties in the
 * scene's order — the order the function lists them in (`prompt.ts`).
 */
function tagSeats(seats: TryOnSeat[], pieces: readonly PlacedJewelry[], toothOf: Map<string, string>): TryOnSeat[] {
  const index = new Map(pieces.map((p, i) => [p.id, i]));
  const byTooth = new Map<string, TryOnSeat[]>();
  for (const s of seats) {
    const fdi = toothOf.get(s.id);
    if (!s.front || !fdi) continue;
    byTooth.set(fdi, [...(byTooth.get(fdi) ?? []), s]);
  }
  const tags = new Map<string, string>();
  for (const [fdi, list] of byTooth) {
    list
      .sort((a, b) => a.gum - b.gum || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0))
      .forEach((s, i) => i < LETTERS.length && tags.set(s.id, `${fdi}${LETTERS[i]}`));
  }
  return seats.map((s) => (tags.has(s.id) ? { ...s, tag: tags.get(s.id) } : s));
}

/** The seats of the pieces the front view can place; others are left out. */
export function tryOnSeats(pieces: readonly PlacedJewelry[], model: SceneModel): TryOnSeat[] {
  const { teeth, gems } = projectFrontView(pieces, model);
  const byFdi = new Map(teeth.map((t) => [t.fdi, t]));
  const toothOf = new Map(gems.map((g) => [g.id, g.toothId]));
  const seats = gems.flatMap((g): TryOnSeat[] => {
    const tooth = byFdi.get(g.toothId);
    if (!g.at || !tooth) return [];
    const width = tooth.x1 - tooth.x0;
    const height = tooth.incisal - tooth.cervical;
    if (!(width > 0) || height === 0) return [];
    const centre = (tooth.x0 + tooth.x1) / 2;
    // The midline is x = 0 on the drawing: toward it is the opposite sign of the tooth's centre.
    const towardMidline = -Math.sign(centre) * (g.at.x - centre);
    return [
      {
        id: g.id,
        gum: round(Math.min(1, Math.max(0, (g.at.y - tooth.cervical) / height))),
        mid: round(Math.min(0.5, Math.max(-0.5, towardMidline / width))),
        width: round(Math.min(2, (2 * g.at.r) / width)),
        front: g.at.facing === "front",
      },
    ];
  });
  return tagSeats(seats, pieces, toothOf);
}
