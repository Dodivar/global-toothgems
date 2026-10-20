import wordmark from "../../assets/logo-wordmark-black.png";
import { A4_PORTRAIT_PT, jpegToPdf } from "../../lib/certificate/pdf";
import { layoutPoster, POSTER_PAGE, qrPngSize, type PosterContent, type PosterOp } from "../../lib/glowbookPoster/layout";
import { QR_QUIET_ZONE } from "../../lib/glowbookPoster/qr";

/**
 * The Glowbook's printable files (decision 102), drawn in the browser like
 * the certificate (`lib/certificate/render.ts`): the poster's operations on a
 * 300 dpi canvas wrapped in an A4 portrait PDF, and the QR code alone as a
 * PNG. Browser only — called from click handlers, never during render. The
 * profile picture arrives as a decoded bitmap (downloaded through Storage, so
 * the canvas is never tainted and stays exportable).
 */

const SANS = '"Montserrat", "Helvetica Neue", Arial, sans-serif';
const FONTS = ["500 16px Montserrat", "600 16px Montserrat", "700 16px Montserrat", "800 16px Montserrat"];
/** Pixels per millimetre: 300 dpi. */
const PDF_SCALE = 300 / 25.4;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image unavailable"));
    image.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("export failed"))), type, quality));
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r > 0) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Text in device pixels (some browsers quantise a small font scaled up). */
function drawText(ctx: CanvasRenderingContext2D, op: Extract<PosterOp, { kind: "text" }>, k: number) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${op.weight} ${op.size * k}px ${SANS}`;
  ctx.fillStyle = op.color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  const width = ctx.measureText(op.text).width;
  const squeeze = op.fitWidth && width > op.fitWidth * k ? (op.fitWidth * k) / width : 1;
  ctx.translate(op.x * k, op.y * k);
  ctx.scale(squeeze, 1);
  ctx.fillText(op.text, 0, 0);
  ctx.restore();
}

function drawQr(ctx: CanvasRenderingContext2D, modules: readonly (readonly boolean[])[], x: number, y: number, size: number, color: string) {
  const total = modules.length + QR_QUIET_ZONE * 2;
  const cell = size / total;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = color;
  // On the poster (fractional cells) a hair of overlap hides seams; whole-pixel cells need none.
  const pad = Number.isInteger(cell) ? 0 : 0.01;
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect(x + (c + QR_QUIET_ZONE) * cell, y + (r + QR_QUIET_ZONE) * cell, cell + pad, cell + pad);
    }),
  );
}

async function renderPosterCanvas(content: PosterContent, avatar: ImageBitmap | null): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all(FONTS.map((font) => document.fonts.load(font).catch(() => [])));
  }
  const mark = await loadImage(wordmark.src);
  const ops = layoutPoster({ ...content, hasAvatar: content.hasAvatar && !!avatar });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(POSTER_PAGE.width * PDF_SCALE);
  canvas.height = Math.round(POSTER_PAGE.height * PDF_SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const k = canvas.width / POSTER_PAGE.width;
  ctx.scale(k, k);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, POSTER_PAGE.width, POSTER_PAGE.height);
  ctx.imageSmoothingQuality = "high";
  for (const op of ops) {
    if (op.kind === "text") drawText(ctx, op, k);
    else if (op.kind === "rect") {
      ctx.fillStyle = op.fill;
      roundedRect(ctx, op.x, op.y, op.w, op.h, op.radius ?? 0);
      ctx.fill();
    } else if (op.kind === "circle") {
      ctx.fillStyle = op.fill;
      ctx.beginPath();
      ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.kind === "avatar" && avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, op.cx - op.r, op.cy - op.r, op.r * 2, op.r * 2);
      ctx.restore();
    } else if (op.kind === "wordmark") {
      ctx.drawImage(mark, op.x, op.y, op.w, op.h);
    } else if (op.kind === "qr") {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      drawQr(ctx, op.modules, op.x, op.y, op.size, op.color);
      ctx.restore();
    }
  }
  return canvas;
}

/** The A4 poster as a PDF, to print. */
export async function glowbookPosterPdf(content: PosterContent, avatar: ImageBitmap | null, meta: { title: string; author: string }): Promise<Blob> {
  const canvas = await renderPosterCanvas(content, avatar);
  const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.95)).arrayBuffer());
  const pdf = jpegToPdf(jpeg, { width: canvas.width, height: canvas.height }, meta, A4_PORTRAIT_PT);
  return new Blob([pdf as BlobPart], { type: "application/pdf" });
}

/** The QR code alone, black on white with its quiet zone, as a PNG (whole pixels per module). */
export async function glowbookQrPng(modules: readonly (readonly boolean[])[]): Promise<Blob> {
  // Whole pixels per module: the drawing's cell size is an integer, the edges stay sharp.
  const { size } = qrPngSize(modules.length);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.imageSmoothingEnabled = false;
  drawQr(ctx, modules, 0, 0, size, "#000000");
  return toBlob(canvas, "image/png");
}

export { saveFile } from "../../lib/saveFile";
