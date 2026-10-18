import type { PlacedJewelry, StudioShape } from "../../data/studioEditor";
import type { SceneModel } from "../studioWorkspace/scene";
import { FRONT_VIEW_TEETH, crownOutline, gemOutline, projectFrontView, type FrontViewPathCommand } from "./frontView";
import type { BoxPlacement } from "./tryOnTransform";

/**
 * What the try-on overlay draws inside its box (pixels, origin top-left, y
 * down): the creation's gems from the Studio's front view (`frontView.ts`),
 * and the outline of the front teeth as an alignment guide for the artist.
 *
 * The box shows the whole front-view frame, fitted to its width and centred
 * vertically, so matching the guide's teeth to the photo's teeth puts every
 * gem on its tooth. After an automatic placement (`placements` not null) the
 * gems are drawn where the service put them instead, and the guide is left
 * out: it would not match. Gems on the tongue side are left out too — they
 * cannot be seen on a front photo — as are those the front view cannot place.
 *
 * Pure: no React, no DOM. Both halves of the try-on renderer (live SVG and
 * exported canvas) draw from it, so the download matches the screen.
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
  /** Crown outlines of the guide, box pixels; empty after an automatic placement. */
  guide: FrontViewPathCommand[][];
}

/** The front teeth used as the alignment guide: incisors and canines of both arches. */
const GUIDE_TEETH = new Set(["13", "12", "11", "21", "22", "23", "43", "42", "41", "31", "32", "33"]);

export function tryOnLayout(
  pieces: readonly PlacedJewelry[],
  model: SceneModel,
  placements: readonly BoxPlacement[] | null,
  width: number,
  height: number,
): TryOnLayout {
  if (!(width > 0) || !(height > 0)) return { spots: [], guide: [] };
  const looks = new Map(pieces.map((p) => [p.id, p.look]));

  if (placements) {
    const spots = placements.flatMap((p): TryOnSpot[] => {
      const look = looks.get(p.pieceId);
      if (!look) return [];
      const at = { x: p.x * width, y: p.y * height, r: (p.size * width) / 2, rotation: p.rotation };
      return [{ pieceId: p.pieceId, shape: look.shape, color: look.color, ...at, outline: gemOutline(look.shape, at) }];
    });
    return { spots, guide: [] };
  }

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
    const at = { x, y, r: g.at.r * scale, rotation: g.at.rotation };
    return [{ pieceId: g.id, shape: g.shape, color: g.piece.look.color, ...at, outline: gemOutline(g.shape, at) }];
  });
  const guide = FRONT_VIEW_TEETH.filter((t) => GUIDE_TEETH.has(t.fdi)).map((t) => mapPath(crownOutline(t)));
  return { spots, guide };
}
