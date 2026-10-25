import { pathToSvg } from "../../../lib/studio3d/frontView";
import type { TryOnCreation } from "../../../lib/studio3d/tryOn";
import { OVERLAY_ASPECT } from "../../../lib/studio3d/tryOnTransform";
import { frontViewGemRenderer } from "./frontViewGemRenderer";
import { layoutOf } from "./frontViewLayout";

const WIDTH = 1024;

/**
 * The creation's front view as a PNG — the front teeth outlined in grey and
 * the gems on them, on white — sent to the image model as a visual hint of
 * the layout (decision 111). The list of gems the model must follow comes
 * from the database, not from this picture. Null when the browser cannot draw.
 */
export async function renderDesignImage(creation: TryOnCreation): Promise<Blob | null> {
  const height = Math.round(WIDTH * OVERLAY_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  const props = { creation, width: WIDTH, height };
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#9aa3ad";
  for (const crown of layoutOf(props).guide) ctx.stroke(new Path2D(pathToSvg(crown)));
  await frontViewGemRenderer.paint(ctx, props);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
