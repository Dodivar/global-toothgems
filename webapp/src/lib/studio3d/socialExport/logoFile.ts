import { logoFileProblem, logoTargetSize, type LogoProblem } from "./branding";

/**
 * A member's logo, made ready to store: checked like the bucket checks it,
 * decoded, redrawn as a PNG within 1024 px (transparency kept, metadata
 * dropped). Browser only.
 */
export type PreparedLogo = { ok: true; png: Blob } | { ok: false; problem: LogoProblem | "decode" };

export async function prepareLogo(file: File): Promise<PreparedLogo> {
  const problem = logoFileProblem(file);
  if (problem) return { ok: false, problem };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, problem: "decode" };
  }
  try {
    const { width, height } = logoTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, problem: "decode" };
    ctx.drawImage(bitmap, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) return { ok: false, problem: "decode" };
    if (png.size > 2 * 1024 * 1024) return { ok: false, problem: "size" };
    return { ok: true, png };
  } finally {
    bitmap.close();
  }
}
