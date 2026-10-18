import { ALL_TEETH, FREE_TOOTH, LOWER_TEETH, UPPER_TEETH, isLowerTooth, toothKeys, type PlacedJewelry, type StudioShape } from "../../data/studioEditor";
import type { SceneModel } from "../studioWorkspace/scene";
import { ARCH_FRAME_BY_ID } from "./archLayout";
import { DENTITION_CROWNS, type CrownFrame } from "./dentition";

/**
 * The front view of a design: both arches drawn flat, as seen from in front of
 * the patient, with every piece at its place on its tooth — the drawing of the
 * placement sheet and of the "front view" panels.
 *
 * The teeth are the Studio's default dentition (`DENTITION_CROWNS`) in a
 * front orthographic projection: each crown spans its calibrated width along
 * the arch, foreshortened by how much it faces the viewer, and its calibrated
 * height. Every piece is expressed as a seat on its tooth — across and up,
 * as fractions of the crown, the engine's own `captureSeats` — in the frame
 * of the model it was placed on (the dentition, or the procedural reference
 * arch `ARCH_FRAMES`, upper arch only), then put on the same drawn crown. On
 * the dentition's front teeth that is the orthographic projection itself
 * (world x → right, world y → up). Pieces on an
 * imported model, or off the labelled teeth, have no known tooth frame: they
 * are numbered and listed, never drawn at a guessed place.
 *
 * Coordinates: millimetres in the drawing's frame, x to the viewer's right
 * (the patient's left), y DOWN (SVG convention). `box` is the frame around
 * the teeth; normalised coordinates (`nx`, `ny`, 0..1, y down) are relative
 * to it, and sizes (`nr`) to its width, so a gem keeps its shape whatever
 * the aspect of the surface it is drawn on.
 *
 * Pure: no React, no three.js, no DOM. Unit-tested in `frontView.test.ts`.
 */

/** A rectangle of the drawing, in millimetres, y down. */
export interface FrontViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One crown of the drawing. */
export interface FrontViewTooth {
  fdi: string;
  lower: boolean;
  /** Left and right edges (viewer's view), mm. */
  x0: number;
  x1: number;
  /** Gum side and biting edge, mm, y down: `cervical < incisal` on the upper arch, the reverse on the lower. */
  cervical: number;
  incisal: number;
  /** Canines end in a point. */
  pointed: boolean;
}

/** Where a piece is drawn. */
export interface FrontViewPoint {
  /** Centre, mm, y down. */
  x: number;
  y: number;
  /** Half the piece's longest side, mm (its real size). */
  r: number;
  /** Centre normalised to `box` (0..1, y down). */
  nx: number;
  ny: number;
  /** `r` divided by the box width. */
  nr: number;
  /** Turn on screen, degrees, clockwise. */
  rotation: number;
  /** Seat on the tooth: `u` across (-1 viewer's left … 1 right), `v` up the crown (world up), as the engine measures them. */
  u: number;
  v: number;
  /** `back`: the piece sits on the tongue side of its tooth — hidden from the front. */
  facing: "front" | "back";
}

export interface FrontViewGem {
  id: string;
  /** 1-based label on the drawing and in every list: reading order (upper arch, then lower, left to right). */
  number: number;
  /** 1-based suggested placement order: upper arch first, from the midline outward, patient's right before left. */
  order: number;
  toothId: string;
  shape: StudioShape;
  piece: PlacedJewelry;
  /** Null when the piece cannot be drawn (imported model, free placement): it is still numbered and listed. */
  at: FrontViewPoint | null;
}

export interface FrontViewProjection {
  /** Frame of the drawing: every tooth with a small margin. Fixed: it does not move with the pieces. */
  box: FrontViewBox;
  /** `box.width / box.height`. */
  aspect: number;
  /** Lower arch first, then upper: the drawing order (upper incisors overlap the lower ones, as in occlusion). */
  teeth: FrontViewTooth[];
  /** Every piece, sorted by `number`. */
  gems: FrontViewGem[];
  /** How many gems have no place on the drawing. */
  unplaced: number;
}

/** Margin around the teeth, mm. */
const MARGIN = 2;

const byFdi = new Map(DENTITION_CROWNS.map((c) => [c.fdi, c]));
const halfWidth = (c: CrownFrame) => (c.alongMinus + c.alongPlus) / 2;
const halfHeight = (c: CrownFrame) => (c.top - c.bottom) / 2;

function toothOf(c: CrownFrame): FrontViewTooth {
  const tx = Math.abs(c.tangent.x);
  const key = toothKeys(c.fdi)?.tooth;
  return {
    fdi: c.fdi,
    lower: c.lower,
    x0: c.center.x - c.alongMinus * tx,
    x1: c.center.x + c.alongPlus * tx,
    cervical: c.lower ? -c.bottom : -c.top,
    incisal: c.lower ? -c.top : -c.bottom,
    pointed: key === "canine",
  };
}

/** The drawing's teeth, lower arch first (see `FrontViewProjection.teeth`). */
export const FRONT_VIEW_TEETH: FrontViewTooth[] = [
  ...DENTITION_CROWNS.filter((c) => c.lower),
  ...DENTITION_CROWNS.filter((c) => !c.lower),
].map(toothOf);

export const FRONT_VIEW_BOX: FrontViewBox = (() => {
  const xs = FRONT_VIEW_TEETH.flatMap((t) => [t.x0, t.x1]);
  const ys = FRONT_VIEW_TEETH.flatMap((t) => [t.cervical, t.incisal]);
  const x = Math.min(...xs) - MARGIN;
  const y = Math.min(...ys) - MARGIN;
  return { x, y, width: Math.max(...xs) + MARGIN - x, height: Math.max(...ys) + MARGIN - y };
})();

const dot = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x * b.x + a.z * b.z;

/**
 * Where a piece sits on its tooth, in the frame of the model it was placed
 * on — the engine's `captureSeats`, without three.js. Null: no known frame.
 */
export function seatOnTooth(piece: PlacedJewelry, model: SceneModel): { u: number; v: number; facing: "front" | "back" } | null {
  const clamp = (n: number) => Math.min(1.4, Math.max(-1.4, n));
  if (model === "dentition") {
    const c = byFdi.get(piece.toothId);
    if (!c) return null;
    const rel = { x: piece.position.x - c.center.x, y: piece.position.y - c.center.y, z: piece.position.z - c.center.z };
    return {
      u: clamp(dot(rel, c.tangent) / (halfWidth(c) * 0.6)),
      v: clamp(rel.y / (halfHeight(c) * 0.55)),
      facing: dot(piece.normal, c.outward) < 0 ? "back" : "front",
    };
  }
  if (model === "studio") {
    const f = ARCH_FRAME_BY_ID[piece.toothId];
    if (!f) return null;
    const rel = { x: piece.position.x - f.center.x, y: piece.position.y - f.center.y, z: piece.position.z - f.center.z };
    return {
      u: clamp(dot(rel, f.tangent) / (f.spec.wHalf * 0.6)),
      v: clamp(rel.y / (f.spec.hHalf * 0.55)),
      facing: dot(piece.normal, f.outward) < 0 ? "back" : "front",
    };
  }
  return null;
}

/**
 * Where a piece is drawn, or null: its seat on its tooth, put on the drawn
 * crown. On the dentition itself this is the orthographic projection (world
 * x and y) for the front teeth; on the side teeth, whose outer face is seen
 * edge-on, it keeps the piece on its crown rather than past its edge.
 */
function pointOf(piece: PlacedJewelry, model: SceneModel): FrontViewPoint | null {
  const c = byFdi.get(piece.toothId);
  const seat = c ? seatOnTooth(piece, model) : null;
  if (!c || !seat) return null;
  const x = c.center.x + c.tangent.x * seat.u * halfWidth(c) * 0.6;
  const worldY = c.center.y + seat.v * halfHeight(c) * 0.55;
  const r = piece.scale;
  const box = FRONT_VIEW_BOX;
  const y = -worldY;
  return {
    x,
    y,
    r,
    nx: (x - box.x) / box.width,
    ny: (y - box.y) / box.height,
    nr: r / box.width,
    rotation: -piece.rotation,
    u: seat.u,
    v: seat.v,
    facing: seat.facing,
  };
}

/** Position of a tooth in reading order (upper arch left → right, then lower), for pieces that are not drawn. */
const READING_INDEX = new Map([...UPPER_TEETH, ...LOWER_TEETH].map((fdi, i) => [fdi, i]));

/** 1 for the central incisors … 7 for the second molars. */
function rankFromMidline(fdi: string): number {
  const n = fdi.length === 2 ? Number(fdi[1]) : NaN;
  return Number.isFinite(n) ? n : 99;
}

/** Patient's right first (quadrants 1 and 4), as a dentist reads the chart. */
function sideRank(fdi: string): number {
  return fdi[0] === "1" || fdi[0] === "4" ? 0 : 1;
}

const archRank = (fdi: string) => (fdi === FREE_TOOTH || !ALL_TEETH.includes(fdi) ? 2 : isLowerTooth(fdi) ? 1 : 0);

/**
 * Project a design onto the front view. `model` is the dentition the pieces
 * were placed on (`StudioScene.model`, or the editor's model on stage).
 *
 * Numbering: drawn pieces in reading order — upper arch then lower, the
 * viewer's left to right, then top to bottom; pieces that cannot be drawn
 * come last, by tooth. The suggested placement order starts with the upper
 * arch, from the midline outward, the patient's right before the left, the
 * gum side of a tooth before its biting edge.
 */
export function projectFrontView(pieces: readonly PlacedJewelry[], model: SceneModel): FrontViewProjection {
  const entries = pieces.map((piece) => ({ piece, at: pointOf(piece, model) }));
  const tieBreak = (a: PlacedJewelry, b: PlacedJewelry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const reading = [...entries].sort((a, b) => {
    if (!!a.at !== !!b.at) return a.at ? -1 : 1;
    if (a.at && b.at) {
      const arch = archRank(a.piece.toothId) - archRank(b.piece.toothId);
      if (arch) return arch;
      if (Math.abs(a.at.x - b.at.x) > 1e-6) return a.at.x - b.at.x;
      if (Math.abs(a.at.y - b.at.y) > 1e-6) return a.at.y - b.at.y;
      return tieBreak(a.piece, b.piece);
    }
    const ia = READING_INDEX.get(a.piece.toothId) ?? 999;
    const ib = READING_INDEX.get(b.piece.toothId) ?? 999;
    return ia - ib || tieBreak(a.piece, b.piece);
  });

  const placing = [...entries].sort((a, b) => {
    const ta = a.piece.toothId;
    const tb = b.piece.toothId;
    const arch = archRank(ta) - archRank(tb);
    if (arch) return arch;
    const rank = rankFromMidline(ta) - rankFromMidline(tb);
    if (rank) return rank;
    const side = sideRank(ta) - sideRank(tb);
    if (side) return side;
    // On one tooth: the gum side first, then from the midline outward.
    const va = a.at?.v ?? 0;
    const vb = b.at?.v ?? 0;
    const lower = isLowerTooth(ta);
    if (Math.abs(va - vb) > 1e-6) return lower ? va - vb : vb - va;
    const ua = Math.abs(a.at?.x ?? 0);
    const ub = Math.abs(b.at?.x ?? 0);
    if (Math.abs(ua - ub) > 1e-6) return ua - ub;
    return tieBreak(a.piece, b.piece);
  });
  const orderOf = new Map(placing.map((e, i) => [e.piece.id, i + 1]));

  const gems: FrontViewGem[] = reading.map((e, i) => ({
    id: e.piece.id,
    number: i + 1,
    order: orderOf.get(e.piece.id) ?? i + 1,
    toothId: e.piece.toothId,
    shape: e.piece.look.shape,
    piece: e.piece,
    at: e.at,
  }));
  const box = FRONT_VIEW_BOX;
  return {
    box,
    aspect: box.width / box.height,
    teeth: FRONT_VIEW_TEETH,
    gems,
    unplaced: gems.filter((g) => !g.at).length,
  };
}

/* ------------------------------------------------------------- outlines */

/** A path command in drawing millimetres: move, line, cubic Bézier, close. */
export type FrontViewPathCommand =
  | ["M", number, number]
  | ["L", number, number]
  | ["C", number, number, number, number, number, number]
  | ["Z"];

/** A crown's outline: rounded at the gum, square or pointed at the biting edge. */
export function crownOutline(t: FrontViewTooth): FrontViewPathCommand[] {
  const l = t.x0;
  const r = t.x1;
  const w = r - l;
  const cx = (l + r) / 2;
  // Distance from the gum line toward the biting edge (positive down on the upper arch, up on the lower).
  const dir = t.incisal > t.cervical ? 1 : -1;
  const h = Math.abs(t.incisal - t.cervical);
  const at = (d: number) => t.cervical + dir * d;
  const neck = Math.min(w * 0.18, h * 0.3);
  const corner = Math.min(w * 0.3, 1.4);
  const tip = t.pointed ? h * 0.1 : 0;
  const k = 0.55;
  return [
    ["M", l + w * 0.14, at(0)],
    ["L", r - w * 0.14, at(0)],
    ["C", r - w * 0.14 + w * 0.14 * k, at(0), r, at(neck * (1 - k)), r, at(neck)],
    ["L", r, at(h - corner)],
    ["C", r, at(h - corner * (1 - k)), r - corner * (1 - k), at(h), r - corner, at(h)],
    ...(t.pointed ? ([["L", cx, at(h + tip)]] as FrontViewPathCommand[]) : []),
    ["L", l + corner, at(h)],
    ["C", l + corner * (1 - k), at(h), l, at(h - corner * (1 - k)), l, at(h - corner)],
    ["L", l, at(neck)],
    ["C", l, at(neck * (1 - k)), l + w * 0.14 * (1 - k), at(0), l + w * 0.14, at(0)],
    ["Z"],
  ];
}

/** Commands as an SVG `d` attribute. */
export function pathToSvg(commands: FrontViewPathCommand[]): string {
  return commands.map(([op, ...n]) => `${op}${n.map((v) => Math.round(v * 1000) / 1000).join(" ")}`).join(" ");
}

/** A circle as four cubic arcs. */
export function circleOutline(cx: number, cy: number, r: number): FrontViewPathCommand[] {
  const k = 0.5523 * r;
  return [
    ["M", cx + r, cy],
    ["C", cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ["C", cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ["C", cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ["C", cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ["Z"],
  ];
}

/** Closed polygon through points of the 16-unit glyph grid. */
const poly = (...pts: number[]): FrontViewPathCommand[] => {
  const out: FrontViewPathCommand[] = [["M", pts[0], pts[1]]];
  for (let i = 2; i < pts.length; i += 2) out.push(["L", pts[i], pts[i + 1]]);
  out.push(["Z"]);
  return out;
};

const STAR = poly(8, 1.5, 9.65, 5.73, 14.2, 6, 10.66, 8.87, 11.82, 13.26, 8, 10.8, 4.18, 13.26, 5.34, 8.87, 1.8, 6, 6.35, 5.73);
const HEART: FrontViewPathCommand[] = [
  ["M", 8, 13.5],
  ["C", 4.5, 10.5, 2, 8.4, 2, 5.9],
  ["C", 2, 4, 3.5, 2.8, 5.1, 2.8],
  ["C", 6.4, 2.8, 7.4, 3.6, 8, 4.7],
  ["C", 8.6, 3.6, 9.6, 2.8, 10.9, 2.8],
  ["C", 12.5, 2.8, 14, 4, 14, 5.9],
  ["C", 14, 8.4, 11.5, 10.5, 8, 13.5],
  ["Z"],
];
const RAINDROP: FrontViewPathCommand[] = [
  ["M", 8, 1.5],
  ["C", 8.5, 5, 10.2, 9, 10.2, 11.9],
  ["C", 10.2, 13.4, 9.2, 14.1, 8, 14.1],
  ["C", 6.8, 14.1, 5.8, 13.4, 5.8, 11.9],
  ["C", 5.8, 9, 7.5, 5, 8, 1.5],
  ["Z"],
];

/**
 * The silhouette of each shape on the 16-unit grid of `pieceGlyphs.tsx`
 * (same outlines, without the facets), for drawings that cannot use the SVG
 * glyphs — the PDF sheet. Wire charms are drawn as their filled silhouette.
 */
export const SHAPE_OUTLINES: Record<StudioShape, FrontViewPathCommand[]> = {
  round: circleOutline(8, 8, 6.2),
  baguette: poly(5, 1.5, 11, 1.5, 11.5, 2, 11.5, 14, 11, 14.5, 5, 14.5, 4.5, 14, 4.5, 2),
  square: poly(2, 2, 14, 2, 14, 14, 2, 14),
  heart: HEART,
  "open-heart": HEART,
  kite: poly(8, 1.5, 12, 8, 8, 14.5, 4, 8),
  navette: poly(8, 1.5, 11.3, 5, 11.3, 11, 8, 14.5, 4.7, 11, 4.7, 5),
  raindrop: RAINDROP,
  triangle: poly(8, 2, 14, 13.5, 2, 13.5),
  "rivoli-star": STAR,
  starflower: STAR,
  "halo-star": STAR,
  bolt: poly(10.5, 1.5, 4, 8.6, 7.4, 8.6, 5.5, 14.5, 12, 7.2, 8.6, 7.2),
  cherries: [...circleOutline(5, 11.6, 2.6), ...circleOutline(11, 11.6, 2.6)],
  snake: poly(6, 14.5, 9.6, 12.6, 8.6, 10.6, 6.6, 8.4, 8, 6.2, 9.6, 3.6, 8.4, 1.2, 7.2, 2.4, 8.2, 3.4, 6.8, 5.6, 5.2, 8.4, 7.4, 11, 7.6, 12.6, 5.4, 13.6),
  dachshund: poly(1.5, 5.2, 3, 7.6, 9.6, 7.6, 10.6, 5.6, 11.6, 4.6, 13.2, 4.6, 14.5, 6.1, 14.2, 6.6, 12.3, 6.9, 11.6, 8.4, 11.2, 11.9, 10, 11.9, 10, 9.6, 4.5, 9.6, 4, 11.9, 2.8, 11.9, 2.6, 8.6),
};

/** Longest side of the glyph grid's outlines, in grid units (`pieceGlyphs.tsx`). */
export const GLYPH_SPAN = 13;

/**
 * A gem's silhouette placed on the drawing: the 16-unit outline centred on
 * the gem, turned by its rotation and scaled to its real size.
 */
export function gemOutline(shape: StudioShape, at: Pick<FrontViewPoint, "x" | "y" | "r" | "rotation">): FrontViewPathCommand[] {
  const s = (at.r * 2) / GLYPH_SPAN;
  const a = (at.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const map = (gx: number, gy: number): [number, number] => {
    const lx = (gx - 8) * s;
    const ly = (gy - 8) * s;
    return [at.x + lx * cos - ly * sin, at.y + lx * sin + ly * cos];
  };
  return (SHAPE_OUTLINES[shape] ?? SHAPE_OUTLINES.round).map((cmd): FrontViewPathCommand => {
    if (cmd[0] === "Z") return cmd;
    if (cmd[0] === "C") return ["C", ...map(cmd[1], cmd[2]), ...map(cmd[3], cmd[4]), ...map(cmd[5], cmd[6])];
    return [cmd[0], ...map(cmd[1], cmd[2])];
  });
}
