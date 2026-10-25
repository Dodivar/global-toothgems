import type { PlacedJewelry, StudioShape } from "../../data/studioEditor";
import type { SceneModel } from "../studioWorkspace/scene";
import { FRONT_VIEW_TEETH, crownOutline, gemOutline, projectFrontView, type FrontViewPathCommand } from "./frontView";

/**
 * The creation's front view laid out in a box (pixels, origin top-left, y
 * down): its gems from the Studio's front view (`frontView.ts`) and the
 * outline of the front teeth. Drawn into the picture sent to the AI with the
 * smile photo as a hint of the layout (`components/studio/tryOn/designImage.ts`).
 *
 * The box shows the whole front-view frame, fitted to its width and centred
 * vertically. Gems on the tongue side are left out — they cannot be seen on
 * a front photo — as are those the front view cannot place.
 *
 * Pure: no React, no DOM.
 */

export interface TryOnSpot {
  pieceId: string;
  shape: StudioShape;
  color: string;
  /** Centre and half size, box pixels. */
  x: number;
  y: number;
  r: number;
  /** Degrees, clockwise. */
  rotation: number;
  outline: FrontViewPathCommand[];
}

export interface TryOnLayout {
  spots: TryOnSpot[];
  /** Crown outlines of the front teeth, box pixels. */
  guide: FrontViewPathCommand[][];
}

/** The front teeth used as the alignment guide: incisors and canines of both arches. */
const GUIDE_TEETH = new Set(["13", "12", "11", "21", "22", "23", "43", "42", "41", "31", "32", "33"]);

export function tryOnLayout(
  pieces: readonly PlacedJewelry[],
  model: SceneModel,
  width: number,
  height: number,
): TryOnLayout {
  if (!(width > 0) || !(height > 0)) return { spots: [], guide: [] };
  const projection = projectFrontView(pieces, model);
  const { box } = projection;
  const scale = width / box.width;
  const offsetY = (height - box.height * scale) / 2;
  const toBox = (x: number, y: number): [number, number] => [(x - box.x) * scale, (y - box.y) * scale + offsetY];
  const mapPath = (cmds: FrontViewPathCommand[]) =>
    cmds.map((cmd): FrontViewPathCommand => {
      if (cmd[0] === "Z") return cmd;
      if (cmd[0] === "C") return ["C", ...toBox(cmd[1], cmd[2]), ...toBox(cmd[3], cmd[4]), ...toBox(cmd[5], cmd[6])];
      return [cmd[0], ...toBox(cmd[1], cmd[2])];
    });

  const spots = projection.gems.flatMap((g): TryOnSpot[] => {
    if (!g.at || g.at.facing === "back") return [];
    const [x, y] = toBox(g.at.x, g.at.y);
    const at = { x, y, r: g.at.r * scale, stretch: g.at.stretch, rotation: g.at.rotation };
    return [{ pieceId: g.id, shape: g.shape, color: g.piece.look.color, ...at, outline: gemOutline(g.shape, at) }];
  });
  const guide = FRONT_VIEW_TEETH.filter((t) => GUIDE_TEETH.has(t.fdi)).map((t) => mapPath(crownOutline(t)));
  return { spots, guide };
}
