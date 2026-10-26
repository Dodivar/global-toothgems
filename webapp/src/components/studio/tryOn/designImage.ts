import type { TryOnCreation } from "../../../lib/studio3d/tryOn";
import { ExportStage } from "../../../lib/studio3d/socialExport/exporter";
import { tryOnMap } from "../../../lib/studio3d/tryOnMap";
import type { TryOnSeat } from "../../../lib/studio3d/tryOnSeats";

/** A smile is wide: the still's framing fits the gems with some teeth around them. */
const SIZE = { width: 1280, height: 800 };

/**
 * The creation rendered in 3D on the Studio's dental model, from the front —
 * the Studio's own still (`ExportStage.stageStill`, a hidden stage) as a JPEG,
 * sent to the image model as IMAGE 1 (decision 111): where each gem sits on
 * its tooth, its rotation, cut and look. The list of gems the model must
 * follow comes from the database, not from this picture. Null when the
 * browser cannot draw it (no WebGL, model not loaded).
 */
export async function renderDesignImage(creation: TryOnCreation): Promise<Blob | null> {
  let stage: ExportStage | null = null;
  try {
    stage = await ExportStage.open(creation.scene);
    return await stage.stageStill(SIZE);
  } catch {
    return null;
  } finally {
    stage?.close();
  }
}

/**
 * The flat design map (`tryOnMap`) as a PNG: IMAGE 3 for the image model,
 * the tooth and the place of each gem, tagged like the design data. Null when
 * the browser cannot draw it — the render then goes without the map.
 */
export async function renderDesignMap(creation: TryOnCreation, seats: readonly TryOnSeat[]): Promise<Blob | null> {
  if (!seats.some((s) => s.tag)) return null;
  const map = tryOnMap(creation.scene.pieces, creation.scene.model, seats);
  const url = URL.createObjectURL(new Blob([map.svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = map.width;
    canvas.height = map.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, map.width, map.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
