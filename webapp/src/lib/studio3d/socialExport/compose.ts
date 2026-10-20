import { placeMark, type Layout, type Paint, type Rect, type TextBlock } from "./layouts";
import type { FormatSize } from "./formats";

/**
 * Draws one export picture on a 2D canvas: the layout's background and
 * frame, the 3D render, the texts and the corner mark. Browser only; the
 * positions come from the pure layouts (`layouts.ts`).
 */

const FONT = 'Montserrat, "Helvetica Neue", Arial, sans-serif';
/** The stage's own gradient (the engine's backdrop), for "stage" paints. */
const STAGE_STOPS: [number, string][] = [
  [0, "#f4f8fc"],
  [0.62, "#d3e0ef"],
  [1, "#b9cde5"],
];
const MARK_OPACITY = 0.92;

export interface MarkImage {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export interface FrameContent {
  /** The engine's canvas, holding the render at the layout's render size. */
  render: CanvasImageSource;
  texts: { title?: string; handle?: string };
  mark: MarkImage | null;
}

function paint(ctx: CanvasRenderingContext2D, p: Paint, rect: Rect, size: FormatSize) {
  if (p.kind === "solid") {
    ctx.fillStyle = p.color;
  } else if (p.kind === "linear") {
    const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    p.stops.forEach(([at, c]) => g.addColorStop(at, c));
    ctx.fillStyle = g;
  } else {
    const radial = p.kind === "radial" ? p : { cx: 0.5, cy: 0.4, r: 0.62, stops: STAGE_STOPS };
    const cx = rect.x + rect.w * radial.cx;
    const cy = rect.y + rect.h * radial.cy;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(size.width, size.height) * radial.r);
    radial.stops.forEach(([at, c]) => g.addColorStop(at, c));
    ctx.fillStyle = g;
  }
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function roundedRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === "function") ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  else ctx.rect(r.x, r.y, r.w, r.h);
}

/** The text at its size, shrunk (down to 70 %) then cut with an ellipsis to fit `maxWidth`. */
function fitText(ctx: CanvasRenderingContext2D, block: TextBlock, raw: string): { text: string; size: number } {
  const value = block.uppercase ? raw.toLocaleUpperCase() : raw;
  const font = (size: number) => `${block.weight} ${size}px ${FONT}`;
  let size = block.size;
  ctx.font = font(size);
  while (ctx.measureText(value).width > block.maxWidth && size > block.size * 0.7) {
    size = Math.floor(size * 0.94);
    ctx.font = font(size);
  }
  if (ctx.measureText(value).width <= block.maxWidth) return { text: value, size };
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > block.maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size };
}

function drawText(ctx: CanvasRenderingContext2D, block: TextBlock, raw: string) {
  ctx.save();
  if ("letterSpacing" in ctx && block.tracking) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${block.tracking}px`;
  const { text, size } = fitText(ctx, block, raw);
  ctx.font = `${block.weight} ${size}px ${FONT}`;
  ctx.fillStyle = block.color;
  ctx.textAlign = block.align;
  ctx.textBaseline = "top";
  ctx.fillText(text, block.x, block.y);
  ctx.restore();
}

/** The whole picture, on `ctx` sized `size`. */
export function composeFrame(ctx: CanvasRenderingContext2D, layout: Layout, size: FormatSize, content: FrameContent) {
  ctx.save();
  ctx.clearRect(0, 0, size.width, size.height);
  paint(ctx, layout.background, { x: 0, y: 0, w: size.width, h: size.height }, size);
  if (layout.frame) {
    ctx.save();
    ctx.shadowColor = "rgba(17, 17, 17, 0.12)";
    ctx.shadowBlur = Math.round(size.width * 0.03);
    ctx.shadowOffsetY = Math.round(size.width * 0.008);
    ctx.fillStyle = layout.frame.color;
    roundedRect(ctx, layout.frame.rect, layout.frame.radius);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  roundedRect(ctx, layout.render, layout.renderRadius);
  ctx.clip();
  if (layout.renderOnStage) paint(ctx, { kind: "stage" }, layout.render, size);
  ctx.drawImage(content.render, layout.render.x, layout.render.y, layout.render.w, layout.render.h);
  ctx.restore();
  for (const block of layout.texts) {
    const value = block.role === "title" ? content.texts.title : content.texts.handle;
    if (value && value.trim()) drawText(ctx, block, value.trim());
  }
  if (content.mark) {
    const r = placeMark(layout.mark, content.mark.width, content.mark.height, layout.markAlign);
    ctx.globalAlpha = MARK_OPACITY;
    ctx.drawImage(content.mark.image, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** A copy of `mark` in solid white (the brand wordmark on a dark layout). */
export function whiteMark(mark: MarkImage): MarkImage {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(mark.width));
  c.height = Math.max(1, Math.round(mark.height));
  const ctx = c.getContext("2d");
  if (!ctx) return mark;
  ctx.drawImage(mark.image, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  return { image: c, width: c.width, height: c.height };
}

/** Wait for the brand font, so the first frame is not drawn in the fallback. Never blocks for long. */
export async function fontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.race([
    Promise.all([document.fonts.load(`800 48px ${FONT}`), document.fonts.load(`600 48px ${FONT}`), document.fonts.load(`700 48px ${FONT}`)]).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
}
