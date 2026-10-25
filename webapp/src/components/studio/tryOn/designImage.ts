import { pathToSvg } from "../../../lib/studio3d/frontView";
import type { TryOnCreation } from "../../../lib/studio3d/tryOn";
import { tryOnLayout } from "../../../lib/studio3d/tryOnLayout";

const WIDTH = 1024;
/** Height / width: a smile is wide. */
const ASPECT = 0.5;
const GEM_EDGE = "rgba(38, 60, 82, .7)";

/**
 * The creation's front view as a PNG — the front teeth outlined in grey and
 * the gems on them, on white — sent to the image model as a visual hint of
 * the layout (decision 111). The list of gems the model must follow comes
 * from the database, not from this picture. Null when the browser cannot draw.
 */
export async function renderDesignImage(creation: TryOnCreation): Promise<Blob | null> {
  const height = Math.round(WIDTH * ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  const { spots, guide } = tryOnLayout(creation.scene.pieces, creation.scene.model, WIDTH, height);
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#9aa3ad";
  for (const crown of guide) ctx.stroke(new Path2D(pathToSvg(crown)));
  for (const s of spots) {
    const path = new Path2D(pathToSvg(s.outline));
    ctx.fillStyle = s.color;
    ctx.fill(path);
    ctx.lineWidth = Math.max(0.6, s.r * 0.12);
    ctx.strokeStyle = GEM_EDGE;
    ctx.stroke(path);
    ctx.beginPath();
    ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fill();
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
