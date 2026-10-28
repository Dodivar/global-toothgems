import type { TryOnCreation } from "../../../lib/studio3d/tryOn";
import { ExportStage } from "../../../lib/studio3d/socialExport/exporter";
import { tryOnMap } from "../../../lib/studio3d/tryOnMap";
import type { TryOnSeat } from "../../../lib/studio3d/tryOnSeats";

/** A smile is wide: the still's framing fits the gems with some teeth around them. */
const SIZE = { width: 1280, height: 800 };

/**
 * The creation rendered in 3D on the Studio's dental model, from the front —
 * the Studio's own still (`ExportStage.stageStill`, a hidden stage) as JPEGs,
 * sent to the image model (decision 111):
 *   design    framed on the gems (IMAGE 1): where each gem sits on its tooth,
 *             its rotation, cut and look;
 *   overview  the same stage from further away, the whole smile around the
 *             gems (2026-10-28): a close-up of a few gems alone pushed the
 *             model to enlarge the smile; this one shows their real share.
 * The list of gems the model must follow comes from the database, not from
 * these pictures. Both null when the browser cannot draw them (no WebGL,
 * model not loaded); the overview alone may be missing.
 */
export async function renderDesignImages(creation: TryOnCreation): Promise<{ design: Blob | null; overview: Blob | null }> {
  let stage: ExportStage | null = null;
  try {
    stage = await ExportStage.open(creation.scene);
    const design = await stage.stageStill(SIZE);
    const overview = await stage.stageStill(SIZE, "jpeg", "overview").catch(() => null);
    return { design, overview };
  } catch {
    return { design: null, overview: null };
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
