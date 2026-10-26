import type { TryOnCreation } from "../../../lib/studio3d/tryOn";
import { ExportStage } from "../../../lib/studio3d/socialExport/exporter";

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
