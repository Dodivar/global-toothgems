/**
 * Lining the AI's mouth close-up up with the photo before it is pasted back
 * (decision 111, 2026-10-28). The image model is asked to keep the close-up's
 * framing, but it sometimes answers zoomed in (or shifted): stretched onto
 * the crop as it was, the mouth then came back too large at the right place.
 *
 * So the browser measures where the answer's content sits in the original
 * close-up — one scale and a shift, found by comparing the edges of both
 * pictures (lips, teeth outlines) at a small size — and pastes the answer
 * over that region only. The gems are small and change few edges, so they do
 * not steer the match. When no clear match is found, nothing moves (the
 * answer covers the whole crop, as before).
 *
 * To the pixel (2026-11-18): the paste-back then keeps only the gems
 * (`tryOnGemBlend.ts`), found and matched pixel by pixel against the photo,
 * so the answer must line up to about a pixel, not just to the eye. The match
 * was compared at `ALIGN_WIDTH` (192 px, 8 photo pixels each on a 1536-px
 * close-up) and any move under half a percent was dropped (7.7 photo pixels
 * across, 3.3 down): an answer a gem's width off was pasted as it came, and
 * around every gem the shifted gap, tooth edges and enamel came along (black
 * edges, rings, a gem cut by its neighbour). The search now goes on at
 * `ALIGN_FINE_WIDTH` (768 px, half-pixel steps: about a photo pixel), and the
 * move is kept from about a photo pixel. Whether the match is trusted is
 * still judged at `ALIGN_WIDTH`, as before (fine edges of a redrawn picture
 * correlate less).
 *
 * Pure: it takes the pixels (`Luma`); the drawing is in
 * `components/studio/tryOn/pasteBack.ts`.
 */

/** A grey-level picture, row by row (0–255). */
export interface Luma {
  width: number;
  height: number;
  data: Float32Array;
}

/**
 * Where the answer goes, as shares of the close-up: its left and top edges
 * (`x`, `y`) and its size (`scale`, the same across and down). `{ x: 0, y: 0,
 * scale: 1 }` is the whole close-up, the answer pasted as it came.
 */
export interface CloseUpFit {
  x: number;
  y: number;
  scale: number;
}

export const IDENTITY_FIT: CloseUpFit = { x: 0, y: 0, scale: 1 };

/** The width the match is judged at; the first search runs at a quarter of it. */
export const ALIGN_WIDTH = 192;
/** The width the pictures are drawn at for the match: refined up to it, half a pixel at a time. */
export const ALIGN_FINE_WIDTH = 768;
/** How far the model may have zoomed: its answer showing 70 % to 110 % of the close-up's width. */
const SCALE_MIN = 0.7;
const SCALE_MAX = 1.1;
/** The match must be at least this good (correlation of the edges, −1 to 1)... */
const MIN_SCORE = 0.35;
/** ...and better than leaving the answer where it is by at least this much. */
const MIN_GAIN = 0.03;
/** Moves smaller than this (share of the close-up: under a photo pixel on a 1536-px close-up) are left alone. */
const NEGLIGIBLE = 0.0005;

/** RGBA pixels → grey levels (Rec. 601). */
export function lumaOf(rgba: ArrayLike<number>, width: number, height: number): Luma {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return { width, height, data };
}

/** Half the size, each pixel the mean of four. */
function halve(img: Luma): Luma {
  const width = Math.max(1, img.width >> 1);
  const height = Math.max(1, img.height >> 1);
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = 2 * y * img.width + 2 * x;
      data[y * width + x] = (img.data[i] + img.data[i + 1] + img.data[i + img.width] + img.data[i + img.width + 1]) / 4;
    }
  }
  return { width, height, data };
}

/** The strength of the edges at each pixel (central differences); the border is 0. */
function edges(img: Luma): Luma {
  const { width, height, data } = img;
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = data[i + 1] - data[i - 1];
      const gy = data[i + width] - data[i - width];
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return { width, height, data: out };
}

function sample(img: Luma, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * img.width + x0;
  const d = img.data;
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + img.width] * (1 - fx) + d[i + img.width + 1] * fx) * fy;
}

/**
 * How well the answer's edges match the original's when the answer covers
 * the region `fit` of it: the correlation over the pixels of the answer that
 * fall inside the original (−1 when too few do).
 */
function fitScore(original: Luma, edited: Luma, fit: CloseUpFit): number {
  const { width, height } = edited;
  const sx = (fit.scale * original.width) / width;
  const sy = (fit.scale * original.height) / height;
  const ox = fit.x * original.width;
  const oy = fit.y * original.height;
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = 0; y < height; y++) {
    const py = oy + y * sy;
    if (py < 0 || py >= original.height - 1) continue;
    for (let x = 0; x < width; x++) {
      const px = ox + x * sx;
      if (px < 0 || px >= original.width - 1) continue;
      const a = edited.data[y * width + x];
      const b = sample(original, px, py);
      n++;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  }
  // At least two thirds of the answer must lie on the original.
  if (n < (width * height * 2) / 3) return -1;
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : -1;
}

/** The best fit on a grid of scales and shifts (shifts in pixels of `original`). */
function search(
  original: Luma,
  edited: Luma,
  scales: number[],
  shifts: (scale: number) => { xs: number[]; ys: number[] },
): { fit: CloseUpFit; score: number } {
  let best = { fit: IDENTITY_FIT, score: -Infinity };
  for (const scale of scales) {
    const { xs, ys } = shifts(scale);
    for (const px of xs) {
      for (const py of ys) {
        const fit = { x: px / original.width, y: py / original.height, scale };
        const score = fitScore(original, edited, fit);
        if (score > best.score) best = { fit, score };
      }
    }
  }
  return best;
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(v);
  return out;
};

interface AlignResult {
  fit: CloseUpFit;
  /** The match found, and the answer left where it is (logged in tests, compared here). */
  score: number;
  identityScore: number;
}

/**
 * Where the answer goes on the close-up. `original` and `edited`: the
 * close-up cut from the photo and the AI's answer, both at the same size
 * (`ALIGN_WIDTH` wide at least, `ALIGN_FINE_WIDTH` for a match to about a
 * photo pixel). A coarse search at a quarter of `ALIGN_WIDTH` over every zoom
 * from `SCALE_MIN` to `SCALE_MAX`, then finer ones around the best at each
 * size twice as large, up to the size given (under a second on a phone).
 */
export function alignCloseUp(original: Luma, edited: Luma): AlignResult {
  // The sizes, largest first, down to a quarter of ALIGN_WIDTH.
  const pyramid: [Luma, Luma][] = [[original, edited]];
  while (pyramid[pyramid.length - 1][0].width > ALIGN_WIDTH / 4 + 1) {
    const [a, b] = pyramid[pyramid.length - 1];
    pyramid.push([halve(a), halve(b)]);
  }
  const levels = pyramid.reverse().map(([a, b]) => [edges(a), edges(b)] as const);
  const [coarseA, coarseB] = levels[0];
  let best = search(coarseA, coarseB, range(SCALE_MIN, SCALE_MAX, 0.025), (scale) => {
    // The answer's region, with up to 15 % of it outside the close-up on each side.
    const mx = 0.15 * scale * coarseA.width;
    const my = 0.15 * scale * coarseA.height;
    return {
      xs: range(-mx, (1 - scale) * coarseA.width + mx, 1),
      ys: range(-my, (1 - scale) * coarseA.height + my, 1),
    };
  });
  // Each finer level: around the best, within a pixel and a scale step of the level above. Above
  // ALIGN_WIDTH, a narrower window (the level above is already within a pixel of it), to stay fast.
  let judged: { fit: CloseUpFit; score: number; identityScore: number } | null = null;
  levels.slice(1).forEach(([a, b], k) => {
    const level = k + 1;
    const scaleStep = 0.02 / 2 ** level;
    const pixelStep = level === 1 ? 1 : 0.5;
    const fine = a.width > ALIGN_WIDTH + 1;
    const scaleReach = fine ? 1.5 : 2.5;
    const pixelReach = fine ? 2 : 3;
    const c = best.fit;
    best = search(a, b, range(c.scale - scaleReach * scaleStep, c.scale + scaleReach * scaleStep, scaleStep), () => ({
      xs: range(c.x * a.width - pixelReach * pixelStep, c.x * a.width + pixelReach * pixelStep, pixelStep),
      ys: range(c.y * a.height - pixelReach * pixelStep, c.y * a.height + pixelReach * pixelStep, pixelStep),
    }));
    if (!fine) judged = { ...best, identityScore: fitScore(a, b, IDENTITY_FIT) };
  });
  // A real match, judged at ALIGN_WIDTH as before (or the largest size given, when smaller); better than
  // leaving the answer where it is there, or — a move of a few photo pixels, too small to show at that
  // size — at the finest size.
  const [topA, topB] = levels[levels.length - 1];
  const topIdentity = fitScore(topA, topB, IDENTITY_FIT);
  const { score, identityScore } = judged ?? { score: best.score, identityScore: topIdentity };
  const { fit } = best;
  const moved = Math.abs(fit.scale - 1) > NEGLIGIBLE || Math.abs(fit.x) > NEGLIGIBLE || Math.abs(fit.y) > NEGLIGIBLE;
  const trusted = score >= MIN_SCORE && (score - identityScore >= MIN_GAIN || best.score - topIdentity >= MIN_GAIN);
  return { fit: moved && trusted ? fit : IDENTITY_FIT, score, identityScore };
}
