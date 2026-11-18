/**
 * Reading positions off the reference photo.
 *
 * `grid`: the photo (or a zoomed crop of it) with a labelled pixel grid, so
 * positions are read, not guessed. `toFace`: a gem's pixel position turned
 * into millimetres on its tooth through that tooth's four corners in the
 * photo — a homography per tooth, which undoes the photo's perspective, tilt
 * and zoom for each crown on its own.
 */
import { readFileSync } from "node:fs";

type XY = [number, number];

/** 3×3 homography taking the unit square's corners (0,0) (1,0) (1,1) (0,1) to `q`. */
function squareToQuad(q: XY[]): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const d = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / d;
    h = (dx1 * sy - sx * dy1) / d;
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/**
 * The tooth's corners in the photo, in this order: biting edge on the
 * viewer's left, biting edge on the viewer's right, gum line on the viewer's
 * right, gum line on the viewer's left (for a lower tooth too: biting edge
 * first). Returns where pixel `p` falls on the face, as fractions: s across
 * (0 = viewer's left edge, 1 = right edge), t up the crown (0 = biting edge,
 * 1 = gum line).
 */
export function photoToFaceFraction(quad: XY[], p: XY): { s: number; t: number } {
  if (quad.length !== 4) throw new Error("A tooth's photo quad needs 4 corners.");
  const inv = invert3(squareToQuad(quad));
  const [x, y] = p;
  const w = inv[6] * x + inv[7] * y + inv[8];
  return { s: (inv[0] * x + inv[1] * y + inv[2]) / w, t: (inv[3] * x + inv[4] * y + inv[5]) / w };
}

/** A labelled grid over the photo, or over a crop of it enlarged `zoom` times; labels stay in the photo's own pixels. */
export async function gridImage(photo: string, out: string, opts: { crop?: [number, number, number, number]; step?: number; zoom?: number }) {
  const sharp = (await import("sharp")).default;
  const src = sharp(readFileSync(photo));
  const meta = await src.metadata();
  const [cx, cy, cw, ch] = opts.crop ?? [0, 0, meta.width!, meta.height!];
  const zoom = opts.zoom ?? (opts.crop ? Math.min(4, 1400 / cw) : Math.min(1, 1600 / cw));
  const step = opts.step ?? (opts.crop ? 10 * Math.max(1, Math.round(cw / 120)) : 50 * Math.max(1, Math.round(cw / 1000)));
  const W = Math.round(cw * zoom), H = Math.round(ch * zoom);
  const base = await sharp(readFileSync(photo)).extract({ left: cx, top: cy, width: cw, height: ch }).resize(W, H).png().toBuffer();
  const lines: string[] = [];
  const font = Math.max(11, Math.round(13 * Math.min(2, zoom)));
  for (let x = Math.ceil(cx / step) * step; x <= cx + cw; x += step) {
    const X = (x - cx) * zoom, major = x % (step * 2) === 0;
    lines.push(`<line x1="${X}" y1="0" x2="${X}" y2="${H}" stroke="${major ? "#00e5ff" : "#00e5ff88"}" stroke-width="${major ? 1.4 : 0.8}"/>`);
    if (major) lines.push(`<text x="${X + 3}" y="${font + 2}" font-size="${font}" font-family="sans-serif" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${x}</text>`);
  }
  for (let y = Math.ceil(cy / step) * step; y <= cy + ch; y += step) {
    const Y = (y - cy) * zoom, major = y % (step * 2) === 0;
    lines.push(`<line x1="0" y1="${Y}" x2="${W}" y2="${Y}" stroke="${major ? "#ffea00" : "#ffea0088"}" stroke-width="${major ? 1.4 : 0.8}"/>`);
    if (major) lines.push(`<text x="3" y="${Y - 3}" font-size="${font}" font-family="sans-serif" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${y}</text>`);
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${lines.join("")}</svg>`);
  await sharp(base).composite([{ input: svg }]).png().toFile(out);
  return { width: meta.width, height: meta.height, step, zoom };
}
