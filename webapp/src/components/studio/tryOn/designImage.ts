import type { TryOnCreation } from "../../../lib/studio3d/tryOn";
import { ExportStage } from "../../../lib/studio3d/socialExport/exporter";

/** A smile is wide: the still's framing fits the gems with some teeth around them. */
const SIZE = { width: 1280, height: 800 };

/**
 * The creation rendered in 3D on the Studio's dental model, from the front,
 * framed on the gems — the Studio's own still (`ExportStage.stageStill`, a
 * hidden stage) as a JPEG. IMAGE 3 of the render (decision 111 (k)): the image
 * model reads each gem's cut, colour, material and turn from it; their places
 * come from the guide, never from this picture. Null when the browser cannot
 * draw it (no WebGL, model not loaded).
 */
export async function renderDesignImage(creation: TryOnCreation, viewYaw = 0): Promise<Blob | null> {
  let stage: ExportStage | null = null;
  try {
    // Always in the default porcelain: a coloured dentition could lead the image model to tint the client's teeth.
    stage = await ExportStage.open({ ...creation.scene, modelShade: "porcelain" });
    // Seen from the photo's angle when it is clearly off the front (degrees, positive: from the viewer's right).
    return await stage.stageStill(SIZE, "jpeg", Math.abs(viewYaw) >= 2 ? (viewYaw * Math.PI) / 180 : null);
  } catch {
    return null;
  } finally {
    stage?.close();
  }
}
