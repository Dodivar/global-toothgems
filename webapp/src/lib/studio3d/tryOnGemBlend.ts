/**
 * Keeping only the gems of the AI's answer (decision 111 (k), 2026-11-04).
 * The image model is asked to change nothing but the marks of the placement
 * guide, yet it redraws the whole close-up: teeth, lips and light can drift,
 * and a gem may land beside its mark, grow, or appear where there was none.
 *
 * So the answer, once lined up with the close-up (`tryOnAlign.ts`), is not
 * pasted whole: around each mark only, in a soft disc a little larger than
 * the gem, its colours matched to the photo on a ring just outside; everywhere
 * else the customer's photo stays pixel for pixel. A gem drawn beside its mark
 * (found by the change it made near it) is taken whole, not cut; anything the
 * model drew far from every mark is dropped.
 *
 * Each gem is also measured (`GemCheck`): whether the model drew something at
 * its mark, how far from it and how large — facts for the analytics, never
 * shown to the customer. When the answer differs from the photo everywhere
 * (`background` above `MAX_BACKGROUND`: a regenerated or misaligned picture),
 * the gems cannot be told from the rest: `masked` is false and the caller
 * pastes the close-up whole, as before.
 *
 * Pure: pixels in, pixels out; the drawing is in `components/studio/tryOn/pasteBack.ts`.
 */

/** RGBA pixels, row by row. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** A gem mark, in the pixels of the pictures blended: centre, half longest side, and its cut's proportions. */
export interface BlendMark {
  id: string;
  x: number;
  y: number;
  r: number;
  stretch?: readonly [number, number];
}

export interface GemCheck {
  id: string;
  /** Whether the model changed the picture at the mark (a gem was drawn there). */
  found: boolean;
  /** Distance from the mark's centre to the change's centre, in the mark's half-sizes; null when not found. */
  drift: number | null;
  /** The change's size over the mark's (1: as large; above, drawn larger); approximate; null when not found. */
  size: number | null;
}

export interface GemBlend {
  /** The close-up to paste: the photo, with the answer around each gem; null when `masked` is false. */
  data: Uint8ClampedArray | null;
  checks: GemCheck[];
  /** False: the answer could not be cut around the gems; paste it whole. */
  masked: boolean;
  /** Median change between the photo and the answer away from every gem (0–255). */
  background: number;
}

/** Above this median change away from the gems, the answer is not the photo any more: paste it whole. */
export const MAX_BACKGROUND = 40;
/** A pixel counts as changed by a gem from this difference (0–255, the largest channel) at least... */
const MIN_CHANGE = 30;
/** ...or this many times the change around it, plus a margin, when the answer is noisier. */
const NOISE_FACTOR = 2.5;
const NOISE_MARGIN = 12;
/** Where a gem's change is looked for: this many half-sizes around its mark (plus `WINDOW_PAD` px). */
const WINDOW = 3;
const WINDOW_PAD = 4;
/** A gem was drawn when this share of its mark's area changed at least. */
const MIN_FOUND_SHARE = 0.2;
/** The answer kept around a gem: its half-size times this, plus `KEEP_PAD` px, then a soft edge. */
const KEEP = 1.35;
const KEEP_PAD = 2;
/** A gem drawn this far from its mark (half-sizes) is also kept around where it was drawn. */
const DRIFT_KEPT = 0.35;

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A disc kept from the answer: full up to `inner`, fading to nothing at `outer`. */
interface Disc {
  x: number;
  y: number;
  inner: number;
  outer: number;
}

/**
 * The photo with the answer kept around each gem, and each gem's check. Both
 * pictures have the same size and are lined up; `marks` are in their pixels.
 */
export function blendGems(original: Rgba, edited: Rgba, marks: readonly BlendMark[]): GemBlend {
  const { width, height } = original;
  const O = original.data;
  const E = edited.data;
  if (edited.width !== width || edited.height !== height || O.length < width * height * 4 || E.length < width * height * 4) {
    return { data: null, checks: marks.map((m) => ({ id: m.id, found: false, drift: null, size: null })), masked: false, background: 255 };
  }
  const usable = marks.filter((m) => m.r > 0 && Number.isFinite(m.x) && Number.isFinite(m.y));
  const diffAt = (i: number) => Math.max(Math.abs(E[i] - O[i]), Math.abs(E[i + 1] - O[i + 1]), Math.abs(E[i + 2] - O[i + 2]));
  /** The mark a pixel belongs to: the nearest, in each mark's half-sizes. */
  const ownerOf = (x: number, y: number) => {
    let best = -1;
    let bestDistance = Infinity;
    usable.forEach((m, k) => {
      const d = Math.hypot(x - m.x, y - m.y) / m.r;
      if (d < bestDistance) {
        bestDistance = d;
        best = k;
      }
    });
    return best;
  };
  const windowOf = (m: BlendMark) => WINDOW * m.r + WINDOW_PAD;

  // Away from every gem: how much the answer changed the photo.
  const step = Math.max(1, Math.round(Math.sqrt((width * height) / 20000)));
  const away: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (usable.some((m) => Math.hypot(x - m.x, y - m.y) <= windowOf(m))) continue;
      away.push(diffAt((y * width + x) * 4));
    }
  }
  const background = Math.round(medianOf(away));

  // Each gem: the change near its mark.
  const discs: { disc: Disc; owner: number }[] = [];
  const checks: GemCheck[] = marks.map((m) => ({ id: m.id, found: false, drift: null, size: null }));
  usable.forEach((m, k) => {
    const w = windowOf(m);
    const x0 = Math.max(0, Math.floor(m.x - w));
    const x1 = Math.min(width - 1, Math.ceil(m.x + w));
    const y0 = Math.max(0, Math.floor(m.y - w));
    const y1 = Math.min(height - 1, Math.ceil(m.y + w));
    const ring: number[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - m.x, y - m.y);
        if (d >= 2.2 * m.r && d <= w && ownerOf(x, y) === k) ring.push(diffAt((y * width + x) * 4));
      }
    }
    const threshold = Math.max(MIN_CHANGE, NOISE_FACTOR * medianOf(ring) + NOISE_MARGIN);
    let count = 0;
    let mass = 0;
    let cx = 0;
    let cy = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (Math.hypot(x - m.x, y - m.y) > w || ownerOf(x, y) !== k) continue;
        const d = diffAt((y * width + x) * 4);
        if (d <= threshold) continue;
        const weight = d - threshold;
        count++;
        mass += weight;
        cx += x * weight;
        cy += y * weight;
      }
    }
    const [sx, sy] = m.stretch ?? [1, 1];
    const area = Math.PI * m.r * m.r * Math.max(0.1, sx * sy);
    const keep = (r: number) => KEEP * r + KEEP_PAD;
    const fade = (r: number) => Math.max(3, 0.5 * r);
    discs.push({ disc: { x: m.x, y: m.y, inner: keep(m.r), outer: keep(m.r) + fade(m.r) }, owner: k });
    if (count < Math.max(4, MIN_FOUND_SHARE * area) || mass <= 0) return;
    cx /= mass;
    cy /= mass;
    const extent = Math.sqrt(count / Math.PI);
    const drift = Math.hypot(cx - m.x, cy - m.y) / m.r;
    const index = marks.indexOf(m);
    checks[index] = { id: m.id, found: true, drift: Math.round(drift * 100) / 100, size: Math.round((extent / Math.sqrt(area / Math.PI)) * 100) / 100 };
    // Drawn beside its mark: keep it whole where it was drawn too.
    if (drift > DRIFT_KEPT) discs.push({ disc: { x: cx, y: cy, inner: Math.min(w, keep(extent)), outer: Math.min(w, keep(extent)) + fade(extent) }, owner: k });
  });

  if (background > MAX_BACKGROUND) return { data: null, checks, masked: false, background };

  // Each gem's colour shift: the answer against the photo on a ring just outside what is kept.
  const shifts = usable.map((m, k) => {
    const own = discs.filter((d) => d.owner === k).map((d) => d.disc);
    const outer = Math.max(...own.map((d) => Math.hypot(d.x - m.x, d.y - m.y) + d.outer));
    const band = Math.max(4, 0.6 * m.r);
    const sum = [0, 0, 0];
    let n = 0;
    const x0 = Math.max(0, Math.floor(m.x - outer - band));
    const x1 = Math.min(width - 1, Math.ceil(m.x + outer + band));
    const y0 = Math.max(0, Math.floor(m.y - outer - band));
    const y1 = Math.min(height - 1, Math.ceil(m.y + outer + band));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (own.some((d) => Math.hypot(x - d.x, y - d.y) < d.outer)) continue;
        if (Math.hypot(x - m.x, y - m.y) > outer + band) continue;
        const i = (y * width + x) * 4;
        sum[0] += E[i] - O[i];
        sum[1] += E[i + 1] - O[i + 1];
        sum[2] += E[i + 2] - O[i + 2];
        n++;
      }
    }
    return n ? sum.map((s) => s / n) : [0, 0, 0];
  });

  // How much of the answer each pixel keeps (overlapping discs: the most), and whose colour shift applies.
  const alpha = new Float32Array(width * height);
  const shiftOf = new Int16Array(width * height);
  for (const { disc, owner } of discs) {
    const x0 = Math.max(0, Math.floor(disc.x - disc.outer));
    const x1 = Math.min(width - 1, Math.ceil(disc.x + disc.outer));
    const y0 = Math.max(0, Math.floor(disc.y - disc.outer));
    const y1 = Math.min(height - 1, Math.ceil(disc.y + disc.outer));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const a = 1 - smooth((Math.hypot(x - disc.x, y - disc.y) - disc.inner) / Math.max(1e-6, disc.outer - disc.inner));
        const p = y * width + x;
        if (a > alpha[p]) {
          alpha[p] = a;
          shiftOf[p] = owner;
        }
      }
    }
  }

  // The photo, with the answer (its colours matched) where kept.
  const out = new Uint8ClampedArray(O.subarray(0, width * height * 4));
  for (let p = 0; p < width * height; p++) {
    const a = alpha[p];
    if (a <= 0) continue;
    const shift = shifts[shiftOf[p]];
    const i = p * 4;
    for (let c = 0; c < 3; c++) out[i + c] = O[i + c] * (1 - a) + (E[i + c] - shift[c]) * a;
  }
  return { data: out, checks, masked: true, background };
}
