import { jpegToPdf } from "./pdf";
import { layoutCertificate, PAGE, type CertificateContent, type CertificateOp, type Paint } from "./layout";

/**
 * The certificate as a file: the operations of `layout.ts` drawn on a canvas,
 * exported as a PNG (to post) or wrapped in an A4 PDF (to keep and print).
 * Browser only — called from click handlers, never during render.
 *
 * Canvas text uses the page's own web fonts once they are loaded, so the file
 * is set in Montserrat like the screen; `document.fonts.load` waits for the
 * weights the document uses before anything is drawn.
 */

const SANS = '"Montserrat", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, monospace';
const FONTS = ["400 16px Montserrat", "italic 400 16px Montserrat", "500 16px Montserrat", "600 16px Montserrat", "700 16px Montserrat"];

/** Pixels per millimetre: 300 dpi for print, about 2400 px wide for a post. */
const SCALE = { pdf: 300 / 25.4, png: 2400 / PAGE.width } as const;

function paint(ctx: CanvasRenderingContext2D, value: Paint): string | CanvasGradient {
  if (typeof value === "string") return value;
  const gradient =
    value.kind === "linear"
      ? ctx.createLinearGradient(value.x1, value.y1, value.x2, value.y2)
      : ctx.createRadialGradient(value.cx, value.cy, 0, value.cx, value.cy, value.r);
  for (const stop of value.stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

/**
 * Text is drawn in device pixels (`k` per millimetre) rather than under the
 * page transform: some browsers quantise a 3 px font scaled up tenfold.
 */
function drawText(ctx: CanvasRenderingContext2D, op: Extract<CertificateOp, { kind: "text" }>, k: number) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${op.italic ? "italic " : ""}${op.weight} ${op.size * k}px ${op.mono ? MONO : SANS}`;
  ctx.fillStyle = op.color;
  ctx.textBaseline = "alphabetic";
  const chars = Array.from(op.text);
  const spacing = op.tracking * op.size * k;
  // Letter spacing drawn by hand: `ctx.letterSpacing` is not everywhere yet.
  const natural = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
  const squeeze = op.fitWidth && natural > op.fitWidth * k ? (op.fitWidth * k) / natural : 1;
  const width = natural * squeeze;
  const left = op.align === "middle" ? op.x * k - width / 2 : op.align === "end" ? op.x * k - width : op.x * k;
  ctx.translate(left, op.y * k);
  ctx.scale(squeeze, 1);
  let x = 0;
  if (spacing === 0) {
    ctx.textAlign = "left";
    ctx.fillText(op.text, 0, 0);
  } else {
    for (const ch of chars) {
      ctx.fillText(ch, x, 0);
      x += ctx.measureText(ch).width + spacing;
    }
  }
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, op: CertificateOp, k: number) {
  if (op.kind === "text") return drawText(ctx, op, k);
  ctx.save();
  ctx.globalAlpha = op.opacity ?? 1;
  const path = new Path2D();
  if (op.kind === "rect") path.rect(op.x, op.y, op.w, op.h);
  else if (op.kind === "circle") path.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
  else path.addPath(new Path2D(op.d));
  if (op.fill) {
    ctx.fillStyle = paint(ctx, op.fill);
    ctx.fill(path);
  }
  if (op.stroke) {
    ctx.strokeStyle = paint(ctx, op.stroke);
    ctx.lineWidth = op.lineWidth ?? 0.25;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(path);
  }
  ctx.restore();
}

async function renderCanvas(content: CertificateContent, scale: number): Promise<HTMLCanvasElement> {
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all(FONTS.map((font) => document.fonts.load(font).catch(() => [])));
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PAGE.width * scale);
  canvas.height = Math.round(PAGE.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const k = canvas.width / PAGE.width;
  ctx.scale(k, k);
  for (const op of layoutCertificate(content)) draw(ctx, op, k);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("export failed"))), type, quality);
  });
}

/** The certificate as an image, for social posts. */
export async function certificatePng(content: CertificateContent): Promise<Blob> {
  return toBlob(await renderCanvas(content, SCALE.png), "image/png");
}

/** The certificate as an A4 landscape PDF, for keeping and printing. */
export async function certificatePdf(content: CertificateContent): Promise<Blob> {
  const canvas = await renderCanvas(content, SCALE.pdf);
  const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
  const pdf = jpegToPdf(jpeg, { width: canvas.width, height: canvas.height }, {
    title: `${content.title} — ${content.courseTitle}`,
    author: content.issuer,
  });
  return new Blob([pdf as BlobPart], { type: "application/pdf" });
}

/** Hands a file to the browser's download. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked later: some browsers start reading the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
