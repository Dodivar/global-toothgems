import { overlayFrame, type OverlayTransform } from "../../../lib/studio3d/tryOnTransform";
import type { GemOverlayProps, TryOnGemRenderer } from "./gemOverlay";
import type { PreparedPhoto } from "./preparePhoto";

/**
 * The photo with the creation on it, as an image file, drawn in this tab at
 * the prepared photo's size with the same frame as the live view
 * (`overlayFrame`). Nothing leaves the browser: the caller downloads it or
 * hands it to the system share sheet.
 */
export async function composeTryOn({
  photo,
  transform,
  opacity,
  renderer,
  overlay,
  fileName,
}: {
  photo: PreparedPhoto;
  transform: OverlayTransform;
  opacity: number;
  renderer: TryOnGemRenderer;
  overlay: Omit<GemOverlayProps, "width" | "height">;
  fileName: string;
}): Promise<File> {
  const image = await createImageBitmap(photo.blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = photo.width;
    canvas.height = photo.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(image, 0, 0, photo.width, photo.height);
    const frame = overlayFrame(transform, photo.width, photo.height);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(frame.centerX, frame.centerY);
    ctx.rotate(frame.rotationRad);
    ctx.translate(-frame.width / 2, -frame.height / 2);
    await renderer.paint(ctx, { ...overlay, width: frame.width, height: frame.height });
    ctx.restore();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("encode");
    return new File([blob], fileName, { type: "image/jpeg" });
  } finally {
    image.close();
  }
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
