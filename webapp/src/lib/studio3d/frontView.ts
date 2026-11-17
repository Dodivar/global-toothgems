import {
  ALL_TEETH,
  FREE_TOOTH,
  LOWER_TEETH,
  UPPER_TEETH,
  isLowerTooth,
  scaleForSize,
  toothKeys,
  type PlacedJewelry,
  type StudioShape,
  type ToothKey,
} from "../../data/studioEditor";
import type { GemSize } from "../gemOptions";
import type { SceneModel } from "../studioWorkspace/scene";
import { ARCH_FRAME_BY_ID } from "./archLayout";
import { DENTITION_CROWNS, type CrownFrame } from "./dentition";
import { longAxis } from "./pieceScale";
import { SMILE_CROWNS } from "./smileDentition";

/**
 * The front projection of a design: both arches as seen from in front of the
 * patient, with every piece at its place on its tooth — what the try-on fits
 * onto a photo (`tryOnRegistration.ts`). The drawing people read (the "front
 * view" panels, the placement sheet) is the front render of `renderView.ts`, which
 * shares this module's seats, numbering and gem outlines.
 *
 * The teeth are the reference anatomy (`DENTITION_CROWNS`: a real adult
 * dentition, measured on the scan the Studio used before its procedural
 * dentition) in a front orthographic projection: each crown spans its
 * calibrated width along the arch, foreshortened by how much it faces the
 * viewer, and its calibrated height. Every piece is expressed as a seat on
 * its tooth — across and up, as fractions of the crown, the engine's own
 * `captureSeats` — in the frame of the model it was placed on (the Studio's
 * dentition `SMILE_CROWNS`, the scan, or the procedural reference arch
 * `ARCH_FRAMES`, upper arch only), then put on the same drawn crown. Pieces
 * on an imported model, or off the labelled teeth, have no known tooth frame:
 * they are numbered and listed, never drawn at a guessed place.
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
  /** The tooth's type: what its crown looks like. */
  kind: ToothKey;
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
  /**
   * Stretch of the glyph across and along its own frame, on top of the
   * uniform `r` (`glyphStretch`): [1, 1] unless the size gives a width and a length.
   */
  stretch: readonly [number, number];
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
/** The crown frames of each built-in model whose crowns are calibrated: where a piece's seat is measured. */
const CROWNS_BY_MODEL: Partial<Record<SceneModel, Map<string, CrownFrame>>> = {
  smile: new Map(SMILE_CROWNS.map((c) => [c.fdi, c])),
  dentition: byFdi,
};
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
    kind: key ?? "central",
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
  const crowns = CROWNS_BY_MODEL[model];
  if (crowns) {
    const c = crowns.get(piece.toothId);
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

/** A piece's seat on its tooth, as `seatOnTooth` measures it. */
export type FrontViewSeat = NonNullable<ReturnType<typeof seatOnTooth>>;

/**
 * A drawing of the dentition a design can be projected onto: its frame, its
 * teeth, and where a seat on a tooth lands (mm, y down; null: tooth not drawn).
 */
export interface FrontViewLayout {
  box: FrontViewBox;
  teeth: FrontViewTooth[];
  /** `scale`: the piece's size on this tooth (default 1), below 1 on a drawn tooth seen at an angle. */
  place: (fdi: string, seat: FrontViewSeat) => { x: number; y: number; scale?: number } | null;
}

/**
 * The orthographic front projection, as the try-on fits it on a photo
 * (`tryOnRegistration.ts`). On the dentition itself this is world x and y
 * for the front teeth; on the side teeth, whose outer face is seen edge-on,
 * it keeps the piece on its crown rather than past its edge.
 */
const FRONT_LAYOUT: FrontViewLayout = {
  box: FRONT_VIEW_BOX,
  teeth: FRONT_VIEW_TEETH,
  place: (fdi, seat) => {
    const c = byFdi.get(fdi);
    if (!c) return null;
    return { x: c.center.x + c.tangent.x * seat.u * halfWidth(c) * 0.6, y: -(c.center.y + seat.v * halfHeight(c) * 0.55) };
  },
};

/** Where a piece is drawn on `layout`, or null: its seat on its tooth, put on the drawn crown. */
function pointOf(piece: PlacedJewelry, model: SceneModel, layout: FrontViewLayout): FrontViewPoint | null {
  const seat = seatOnTooth(piece, model);
  const point = seat ? layout.place(piece.toothId, seat) : null;
  if (!seat || !point) return null;
  const { x, y } = point;
  const r = piece.scale * (point.scale ?? 1);
  const box = layout.box;
  return {
    x,
    y,
    r,
    nx: (x - box.x) / box.width,
    ny: (y - box.y) / box.height,
    nr: r / box.width,
    stretch: glyphStretch(piece.look.shape, piece.size),
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
  return projectOnto(FRONT_LAYOUT, pieces, model);
}

/** `projectFrontView` on another drawing of the dentition (the front render, `renderView.ts`): same numbering and order rules. */
export function projectOnto(layout: FrontViewLayout, pieces: readonly PlacedJewelry[], model: SceneModel): FrontViewProjection {
  const entries = pieces.map((piece) => ({ piece, at: pointOf(piece, model, layout) }));
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
  const box = layout.box;
  return {
    box,
    aspect: box.width / box.height,
    teeth: layout.teeth,
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

/** Width and height of each outline on the glyph grid (control points included: a bound, close enough to draw with). */
const GLYPH_EXTENTS = new Map(
  (Object.entries(SHAPE_OUTLINES) as [StudioShape, FrontViewPathCommand[]][]).map(([shape, cmds]) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const cmd of cmds) for (let i = 1; i + 1 < cmd.length; i += 2) xs.push(cmd[i] as number), ys.push(cmd[i + 1] as number);
    return [shape, [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] as const];
  }),
);

/**
 * How much a glyph is stretched across and along its own frame so a piece
 * sized width × length is drawn at both (decision 107). The outline's long
 * axis keeps the uniform scale (`2r / GLYPH_SPAN`, as every piece is drawn);
 * its short axis is set so that it spans the width exactly. [1, 1] for an SS
 * size or a single millimetre value: such pieces draw exactly as before.
 */
export function glyphStretch(shape: StudioShape, size: GemSize): [number, number] {
  if (!size.mm || size.mm.length !== 2) return [1, 1];
  const extents = GLYPH_EXTENTS.get(shape) ?? GLYPH_EXTENTS.get("round")!;
  const uniform = (scaleForSize(size) * 2) / GLYPH_SPAN;
  const alongX = longAxis(shape) === "x";
  const short = size.mm[0] / (alongX ? extents[1] : extents[0]) / uniform;
  return alongX ? [1, short] : [short, 1];
}

/**
 * A gem's silhouette placed on the drawing: the 16-unit outline centred on
 * the gem, turned by its rotation and scaled to its real size (per axis, by
 * `stretch` when given).
 */
export function gemOutline(
  shape: StudioShape,
  at: Pick<FrontViewPoint, "x" | "y" | "r" | "rotation"> & { stretch?: readonly [number, number] },
): FrontViewPathCommand[] {
  const s = (at.r * 2) / GLYPH_SPAN;
  const [kx, ky] = at.stretch ?? [1, 1];
  const a = (at.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const map = (gx: number, gy: number): [number, number] => {
    const lx = (gx - 8) * s * kx;
    const ly = (gy - 8) * s * ky;
    return [at.x + lx * cos - ly * sin, at.y + lx * sin + ly * cos];
  };
  return (SHAPE_OUTLINES[shape] ?? SHAPE_OUTLINES.round).map((cmd): FrontViewPathCommand => {
    if (cmd[0] === "Z") return cmd;
    if (cmd[0] === "C") return ["C", ...map(cmd[1], cmd[2]), ...map(cmd[3], cmd[4]), ...map(cmd[5], cmd[6])];
    return [cmd[0], ...map(cmd[1], cmd[2])];
  });
}
