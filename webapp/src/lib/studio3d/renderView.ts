import { toothKeys, type PlacedJewelry, type ToothKey } from "../../data/studioEditor";
import type { SceneModel } from "../studioWorkspace/scene";
import { projectOnto, type FrontViewBox, type FrontViewLayout, type FrontViewProjection, type FrontViewTooth } from "./frontView";

/**
 * The render view of a design: the gems over the brand's front render of the
 * dentition (`src/assets/studio/dentition-front.*`, made by
 * `scripts/dentition-render.py`) — the placement sheet's figure and the front
 * view panels' drawing.
 *
 * The render is a picture in perspective: each tooth below is the box its
 * visible face fills, measured in the picture's pixels, then put in the
 * drawing's millimetres (the scale of an upper central incisor, seen face on).
 * A piece keeps its seat on its tooth (`seatOnTooth`: across and up, as
 * shares of the crown) and its real size; on the side teeth, seen at an
 * angle, it is drawn smaller (down to half its size), as the tooth is.
 *
 * The render shows twelve teeth per arch: the second molars (17, 27, 37, 47)
 * are not in it, and a piece on them is listed as "not drawn".
 *
 * Pure: no React, no DOM. Unit-tested in `renderView.test.ts`.
 */

/** The picture, px (`dentition-front.webp` / `.jpg`). */
export const RENDER_IMAGE = { width: 954, height: 480 } as const;

/** Midline and biting plane in the picture, px. */
const ORIGIN = { x: 483, y: 263 };
/** Millimetres per pixel: an upper central incisor (8.6 mm) is 132 px wide, face on. */
const MM_PER_PX = 8.6 / 132;
/** The smallest a piece is drawn on a tooth seen at an angle. */
const MIN_SCALE = 0.5;
/** Real crown widths, mm (average adult dimensions): the measure of each tooth's foreshortening. */
const CROWN_WIDTH: Record<"upper" | "lower", Record<ToothKey, number>> = {
  upper: { central: 8.6, lateral: 6.6, canine: 7.6, pm1: 7, pm2: 6.6, m1: 10.2, m2: 9.2 },
  lower: { central: 5.3, lateral: 5.8, canine: 6.9, pm1: 7, pm2: 7.2, m1: 11, m2: 10.4 },
};

/**
 * Each visible tooth: FDI, left and right edges, top and bottom, px. Upper
 * teeth: neck at the top. Lower teeth: biting edge at the top, neck at the
 * rounded bottom.
 */
const TEETH_PX: readonly (readonly [fdi: string, x0: number, x1: number, top: number, bottom: number])[] = [
  ["46", 53, 92, 242, 340],
  ["45", 92, 135, 244, 370],
  ["44", 135, 189, 254, 400],
  ["43", 189, 276, 264, 432],
  ["42", 276, 377, 279, 454],
  ["41", 377, 484, 284, 462],
  ["31", 484, 591, 283, 462],
  ["32", 591, 692, 279, 452],
  ["33", 692, 779, 264, 432],
  ["34", 779, 832, 254, 400],
  ["35", 832, 872, 244, 370],
  ["36", 872, 914, 242, 341],
  ["16", 31, 66, 118, 214],
  ["15", 66, 107, 98, 228],
  ["14", 107, 170, 80, 236],
  ["13", 170, 255, 60, 241],
  ["12", 255, 351, 46, 232],
  ["11", 351, 483, 29, 242],
  ["21", 483, 616, 29, 242],
  ["22", 616, 715, 47, 232],
  ["23", 715, 798, 63, 241],
  ["24", 798, 861, 83, 236],
  ["25", 861, 896, 101, 228],
  ["26", 896, 937, 120, 216],
];

const mmX = (px: number) => (px - ORIGIN.x) * MM_PER_PX;
const mmY = (px: number) => (px - ORIGIN.y) * MM_PER_PX;

/** The picture's teeth, lower arch first (the order of `FrontViewProjection.teeth`), each arch from the viewer's left. */
export const RENDER_VIEW_TEETH: FrontViewTooth[] = TEETH_PX.map(([fdi, x0, x1, top, bottom]) => {
  const kind = toothKeys(fdi)?.tooth ?? "central";
  const lower = fdi[0] === "3" || fdi[0] === "4";
  return {
    fdi,
    lower,
    x0: mmX(x0),
    x1: mmX(x1),
    cervical: mmY(lower ? bottom : top),
    incisal: mmY(lower ? top : bottom),
    pointed: kind === "canine",
    kind,
  };
});

/** The frame: the whole picture. */
export const RENDER_VIEW_BOX: FrontViewBox = {
  x: mmX(0),
  y: mmY(0),
  width: RENDER_IMAGE.width * MM_PER_PX,
  height: RENDER_IMAGE.height * MM_PER_PX,
};

const renderByFdi = new Map(RENDER_VIEW_TEETH.map((t) => [t.fdi, t]));

/** How much smaller a piece is drawn on `t`: its visible width against the real crown's. */
export function renderScale(t: FrontViewTooth): number {
  return Math.min(1, Math.max(MIN_SCALE, (t.x1 - t.x0) / CROWN_WIDTH[t.lower ? "lower" : "upper"][t.kind]));
}

const RENDER_LAYOUT: FrontViewLayout = {
  box: RENDER_VIEW_BOX,
  teeth: RENDER_VIEW_TEETH,
  // The seat's shares of the calibrated crown (`seatOnTooth`), on the visible face.
  place: (fdi, seat) => {
    const t = renderByFdi.get(fdi);
    if (!t) return null;
    return {
      x: (t.x0 + t.x1) / 2 + seat.u * 0.6 * ((t.x1 - t.x0) / 2),
      y: (t.cervical + t.incisal) / 2 - seat.v * 0.55 * (Math.abs(t.incisal - t.cervical) / 2),
      scale: renderScale(t),
    };
  },
};

/**
 * Project a design onto the front render — what the front view panels and the
 * placement sheet draw: `projectFrontView`'s numbering and placement order.
 */
export function projectRenderView(pieces: readonly PlacedJewelry[], model: SceneModel): FrontViewProjection {
  return projectOnto(RENDER_LAYOUT, pieces, model);
}
