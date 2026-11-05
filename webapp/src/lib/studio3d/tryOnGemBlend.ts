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
 * With `reseat` (2026-11-05): a gem drawn beside its mark or too large is not
 * kept where and as the model drew it, but moved back onto its mark at the
 * size of the design: only the pixels the model changed there (the gem, not
 * the tooth around it) are read where it was drawn, scaled down, and laid on
 * the photo at the mark. On the trial of 2026-11-05 the model drew 18 % of the gems more than
 * half a gem off their marks and 20 % more than 30 % larger (hearts up to 1.7
 * times), so the customer did not get the size they had designed.
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
  /** Moved back onto its mark and to its size (`reseat`). */
  reseated?: boolean;
}

export interface BlendOptions {
  /** Move gems drawn beside their marks or too large back onto them, at their size. */
  reseat?: boolean;
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
/** A gem drawn this far from its mark (half-sizes) is also kept around where it was drawn (or, with `reseat`, moved back). */
const DRIFT_KEPT = 0.35;
/**
 * With `reseat`, a gem measured this many times its mark's size or more is
 * scaled down to `RESEAT_TARGET` times it: the measure takes in the gem's
 * sparkle and shadow, so a gem drawn at its size reads about 1.1.
 */
export const RESEAT_SIZE = 1.3;
/** With `reseat`, a gem drawn this far from its mark (half-sizes) is moved back; nearer, kept as drawn. */
export const RESEAT_DRIFT = 0.5;
export const RESEAT_TARGET = 1.1;
/** A gem is moved back only when this share of its drawing's centre changed at least. */
const RESEAT_DENSITY = 0.6;
/** A gem moved back: taken whole within this many times its drawn radius of where it was drawn... */
const GEM_CORE = 1.0;
/** ...and where the model changed the photo, up to this many times. */
const GEM_DISC = 1.15;

/**
 * The colour shift is measured on at least this many tooth pixels around the gem; the ring is widened
 * (up to `SHIFT_MAX_BANDS` times) until it has them.
 */
const SHIFT_MIN_PIXELS = 24;
const SHIFT_MAX_BANDS = 4;

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
export function blendGems(original: Rgba, edited: Rgba, marks: readonly BlendMark[], options: BlendOptions = {}): GemBlend {
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
  /** Per mark, with `reseat`: where its gem was drawn and how much larger, read back onto the mark. */
  const sources: ({ x: number; y: number; scale: number; threshold: number; extent: number } | null)[] = usable.map(() => null);
  const checks: GemCheck[] = marks.map((m) => ({ id: m.id, found: false, drift: null, size: null }));
  /** Per mark: the change above which a pixel near it is the gem's, not the tooth's. */
  const thresholds: number[] = usable.map(() => MIN_CHANGE);
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
    thresholds[k] = threshold;
    const changed: { x: number; y: number; weight: number }[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (Math.hypot(x - m.x, y - m.y) > w || ownerOf(x, y) !== k) continue;
        const d = diffAt((y * width + x) * 4);
        if (d > threshold) changed.push({ x, y, weight: d - threshold });
      }
    }
    const centreOf = (list: typeof changed) => {
      const mass = list.reduce((sum, c) => sum + c.weight, 0);
      return { count: list.length, mass, cx: list.reduce((sum, c) => sum + c.x * c.weight, 0) / (mass || 1), cy: list.reduce((sum, c) => sum + c.y * c.weight, 0) / (mass || 1) };
    };
    let { count, mass, cx, cy } = centreOf(changed);
    // The size is read on all the changes near the mark (as before), the centre refined below.
    const drawnCount = count;
    if (options.reseat) {
      // Onto the gem itself: the changes near the centre found, twice (a neighbour's halo or a redrawn
      // tooth edge in the window pulls the plain centre aside).
      for (let pass = 0; pass < 2 && count > 0; pass++) {
        const reach = Math.max(1.5 * Math.sqrt(count / Math.PI), 1.5 * m.r);
        const near = changed.filter((c) => Math.hypot(c.x - cx, c.y - cy) <= reach);
        if (!near.length) break;
        ({ count, mass, cx, cy } = centreOf(near));
      }
    }
    const [sx, sy] = m.stretch ?? [1, 1];
    const area = Math.PI * m.r * m.r * Math.max(0.1, sx * sy);
    const keep = (r: number) => KEEP * r + KEEP_PAD;
    const fade = (r: number) => Math.max(3, 0.5 * r);
    discs.push({ disc: { x: m.x, y: m.y, inner: keep(m.r), outer: keep(m.r) + fade(m.r) }, owner: k });
    if (count < Math.max(4, MIN_FOUND_SHARE * area) || mass <= 0) return;
    const extent = Math.sqrt(drawnCount / Math.PI);
    const core = Math.sqrt(count / Math.PI);
    const drift = Math.hypot(cx - m.x, cy - m.y) / m.r;
    const index = marks.indexOf(m);
    const size = extent / Math.sqrt(area / Math.PI);
    checks[index] = { id: m.id, found: true, drift: Math.round(drift * 100) / 100, size: Math.round(size * 100) / 100 };
    const scale = size >= RESEAT_SIZE ? size / RESEAT_TARGET : 1;
    // A gem is a dense patch of change; scattered changes (a redrawn tooth edge, a pale crystal that
    // barely changed the tooth) are not moved: kept as drawn.
    const dense = changed.filter((c) => Math.hypot(c.x - cx, c.y - cy) <= 0.6 * core).length >= RESEAT_DENSITY * Math.PI * (0.6 * core) ** 2;
    if (options.reseat && dense && (drift > RESEAT_DRIFT || scale > 1)) {
      // Moved back: the mark's disc reads the answer around where the gem was drawn, scaled.
      sources[k] = { x: cx, y: cy, scale, threshold, extent: core };
      checks[index].reseated = true;
      return;
    }
    // Drawn beside its mark: keep it whole where it was drawn too.
    if (drift > DRIFT_KEPT) discs.push({ disc: { x: cx, y: cy, inner: Math.min(w, keep(extent)), outer: Math.min(w, keep(extent)) + fade(extent) }, owner: k });
  });

  if (background > MAX_BACKGROUND) return { data: null, checks, masked: false, background };

  // Each gem's colour shift: the answer against the photo on the tooth just outside what is kept. Only the
  // tooth: pixels inside any gem's disc, or changed like a gem, are left out — in a tight cluster the ring
  // falls on the neighbouring gems, whose colours (red, or a crystal's grey facets) once tinted the tooth
  // around every gem (a lemon-yellow halo on a heart of small crystals, 2026-11-05). The median, per channel.
  const keptDiscs = [
    ...discs.map((d) => d.disc),
    ...usable.flatMap((m, k) => {
      const source = sources[k];
      return source ? [{ x: source.x, y: source.y, inner: 0, outer: (KEEP * m.r + KEEP_PAD + Math.max(3, 0.5 * m.r)) * source.scale }] : [];
    }),
  ];
  const shifts = usable.map((m, k) => {
    const source = sources[k];
    // A gem moved back: its colours are matched where it was drawn, on a ring around its drawing.
    const own = source
      ? [{ x: source.x, y: source.y, inner: 0, outer: (KEEP * m.r + KEEP_PAD + Math.max(3, 0.5 * m.r)) * source.scale }]
      : discs.filter((d) => d.owner === k).map((d) => d.disc);
    if (source) m = { ...m, x: source.x, y: source.y };
    const outer = Math.max(...own.map((d) => Math.hypot(d.x - m.x, d.y - m.y) + d.outer));
    const band = Math.max(4, 0.6 * m.r);
    const threshold = thresholds[k];
    const read = (reach: number, toothOnly: boolean) => {
      const values: [number[], number[], number[]] = [[], [], []];
      const x0 = Math.max(0, Math.floor(m.x - outer - reach));
      const x1 = Math.min(width - 1, Math.ceil(m.x + outer + reach));
      const y0 = Math.max(0, Math.floor(m.y - outer - reach));
      const y1 = Math.min(height - 1, Math.ceil(m.y + outer + reach));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (Math.hypot(x - m.x, y - m.y) > outer + reach) continue;
          if ((toothOnly ? keptDiscs : own).some((d) => Math.hypot(x - d.x, y - d.y) < d.outer)) continue;
          const i = (y * width + x) * 4;
          if (toothOnly && diffAt(i) > threshold) continue;
          for (let c = 0; c < 3; c++) values[c].push(E[i + c] - O[i + c]);
        }
      }
      return values;
    };
    for (let bands = 1; bands <= SHIFT_MAX_BANDS; bands++) {
      const values = read(bands * band, true);
      if (values[0].length >= SHIFT_MIN_PIXELS) return values.map(medianOf);
    }
    // No tooth to read around (a gem amid others on every side): the plain ring, as before.
    const values = read(band, false);
    return values[0].length ? values.map(medianOf) : [0, 0, 0];
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

  // The answer at a point, between pixels (a gem moved back is read where it was drawn).
  const sample = (x: number, y: number, c: number) => {
    const fx = Math.min(width - 1, Math.max(0, x));
    const fy = Math.min(height - 1, Math.max(0, y));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (xx: number, yy: number) => E[(yy * width + xx) * 4 + c];
    return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
  };

  // The photo, with the answer (its colours matched) where kept.
  const out = new Uint8ClampedArray(O.subarray(0, width * height * 4));
  for (let p = 0; p < width * height; p++) {
    const a = alpha[p];
    if (a <= 0) continue;
    const owner = shiftOf[p];
    const shift = shifts[owner];
    const source = sources[owner];
    const i = p * 4;
    if (source) {
      const m = usable[owner];
      const x = p % width;
      const y = (p - x) / width;
      const sx = source.x + (x - m.x) * source.scale;
      const sy = source.y + (y - m.y) * source.scale;
      // Only the gem: where the model changed the photo there, within the gem's own disc (not a tooth's
      // edge it redrew nearby), softly from half the gem's threshold.
      const q = Math.round(Math.min(height - 1, Math.max(0, sy))) * width + Math.round(Math.min(width - 1, Math.max(0, sx)));
      // The gem's body is taken whole (a pale gem on a pale tooth changes few pixels), its rim only where changed.
      const fromCentre = Math.hypot(sx - source.x, sy - source.y);
      const body = Math.max(source.extent, m.r * source.scale);
      const core = 1 - smooth((fromCentre - GEM_CORE * body) / (0.2 * body));
      const inDisc = 1 - smooth((fromCentre - GEM_DISC * body) / (0.3 * body));
      const changed = smooth((diffAt(q * 4) - 0.5 * source.threshold) / (0.5 * source.threshold));
      const g = a * Math.max(core, inDisc * changed);
      if (g <= 0) continue;
      for (let c = 0; c < 3; c++) out[i + c] = O[i + c] * (1 - g) + (sample(sx, sy, c) - shift[c]) * g;
      continue;
    }
    for (let c = 0; c < 3; c++) out[i + c] = O[i + c] * (1 - a) + (E[i + c] - shift[c]) * a;
  }
  return { data: out, checks, masked: true, background };
}
