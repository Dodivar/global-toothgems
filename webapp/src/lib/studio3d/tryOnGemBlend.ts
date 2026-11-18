/**
 * Keeping only the gems of the AI's answer (decision 111 (k), 2026-11-04).
 * The image model is asked to change nothing but the marks of the placement
 * guide, yet it redraws the whole close-up: teeth, lips and light can drift,
 * and a gem may land beside its mark, grow, or appear where there was none.
 *
 * So the answer, once lined up with the close-up (`tryOnAlign.ts`), is not
 * pasted whole: only each gem is taken from it, its colours matched to the
 * photo on the tooth just around it; everywhere else the customer's photo
 * stays pixel for pixel. Anything the model drew far from every mark is dropped.
 *
 * Reseated (2026-11-05): a gem drawn beside its mark or too large is not
 * kept where and as the model drew it, but moved back onto its mark at the
 * size of the design: read where it was drawn, scaled down, and laid on the
 * photo at the mark. On the trial of 2026-11-05 the model drew 18 % of the gems more than
 * half a gem off their marks and 20 % more than 30 % larger (hearts up to 1.7
 * times), so the customer did not get the size they had designed.
 *
 * Cut to the gem (2026-11-18): what is taken around a gem is no longer a disc
 * of the answer larger than the gem, but a matte — the gem's centre whole (a
 * clear crystal on white enamel barely changes the tooth), then only the
 * pixels the model changed against the photo, within a disc of the gem's
 * size. A disc used to bring along the answer's own tooth around the gem
 * (a ring of slightly different enamel), the dark gap between two teeth when
 * the gem was drawn against it, and a neighbour gem when a large gem was moved
 * back next to it. "Changed" compares each answer pixel with the photo's
 * nearest look-alike within `SHIFT_TOLERANCE` px, so a tooth edge or a gap
 * the model redrew a pixel or two aside is not taken for a gem. Each pixel
 * belongs to one gem only, the nearest mark (in its half-sizes), both where
 * it is laid and where a moved gem is read.
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
  /** Moved back onto its mark and to its size. */
  reseated?: boolean;
}

export interface GemBlend {
  /** The close-up to paste: the photo, with the answer's gems; null when `masked` is false. */
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
/**
 * A gem measured this many times its mark's size or more is
 * scaled down to `RESEAT_TARGET` times it: the measure takes in the gem's
 * sparkle and shadow, so a gem drawn at its size reads about 1.1.
 */
export const RESEAT_SIZE = 1.3;
/** A gem drawn this far from its mark (half-sizes) is moved back; nearer, kept as drawn. */
export const RESEAT_DRIFT = 0.5;
export const RESEAT_TARGET = 1.1;
/** A gem is moved back only when this share of its drawing's centre changed at least. */
const RESEAT_DENSITY = 0.6;

/** The gem's centre, taken whole whatever changed: this many times its half-size, fading over `BODY_FADE`. */
const BODY = 0.6;
const BODY_FADE = 0.15;
/** Beyond, only changed pixels, up to this many times its half-size, fading over `LIMIT_FADE`. */
const LIMIT = 1.1;
const LIMIT_FADE = 0.15;
/** "Changed" looks for the photo's nearest look-alike this many pixels around (a redrawn edge a little aside). */
const SHIFT_TOLERANCE = 2;

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

/**
 * Where a gem is read in the answer and laid on the photo. A point `p` of the
 * photo near the mark reads the answer at `c + (p - mark) * scale`; the gem
 * itself is centred on `c` in the answer, `radius` px in half-size there.
 */
interface Seat {
  /** Centre of the gem in the answer. */
  cx: number;
  cy: number;
  /** Where the photo point on the mark reads the answer: the gem's centre when moved back, else the mark (read in place). */
  ox: number;
  oy: number;
  scale: number;
  /** The gem's half-size in the answer. */
  radius: number;
  threshold: number;
}

/**
 * The photo with each gem of the answer laid on it, and each gem's check. Both
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
  const checks: GemCheck[] = marks.map((m) => ({ id: m.id, found: false, drift: null, size: null }));
  const seats: Seat[] = usable.map((m, k) => {
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
    const inPlace: Seat = { cx: m.x, cy: m.y, ox: m.x, oy: m.y, scale: 1, radius: m.r, threshold };
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
    // Onto the gem itself: the changes near the centre found, twice (a neighbour's halo or a redrawn
    // tooth edge in the window pulls the plain centre aside).
    for (let pass = 0; pass < 2 && count > 0; pass++) {
      const reach = Math.max(1.5 * Math.sqrt(count / Math.PI), 1.5 * m.r);
      const near = changed.filter((c) => Math.hypot(c.x - cx, c.y - cy) <= reach);
      if (!near.length) break;
      ({ count, mass, cx, cy } = centreOf(near));
    }
    const [sx, sy] = m.stretch ?? [1, 1];
    const area = Math.PI * m.r * m.r * Math.max(0.1, sx * sy);
    if (count < Math.max(4, MIN_FOUND_SHARE * area) || mass <= 0) return inPlace;
    const extent = Math.sqrt(drawnCount / Math.PI);
    const core = Math.sqrt(count / Math.PI);
    const drift = Math.hypot(cx - m.x, cy - m.y) / m.r;
    const index = marks.indexOf(m);
    const size = extent / Math.sqrt(area / Math.PI);
    checks[index] = { id: m.id, found: true, drift: Math.round(drift * 100) / 100, size: Math.round(size * 100) / 100 };
    const scale = size >= RESEAT_SIZE ? size / RESEAT_TARGET : 1;
    // A gem is a dense patch of change; scattered changes (a redrawn tooth edge, a pale crystal that
    // barely changed the tooth) are not moved: kept as drawn, in place.
    const dense = changed.filter((c) => Math.hypot(c.x - cx, c.y - cy) <= 0.6 * core).length >= RESEAT_DENSITY * Math.PI * (0.6 * core) ** 2;
    if (dense && (drift > RESEAT_DRIFT || scale > 1)) {
      checks[index].reseated = true;
      return { cx, cy, ox: cx, oy: cy, scale, radius: m.r * scale, threshold };
    }
    // Kept in place, the gem centred where it was drawn (a little beside its mark at most).
    return { ...inPlace, cx, cy };
  });

  if (background > MAX_BACKGROUND) return { data: null, checks, masked: false, background };

  /** How much an answer pixel differs from the photo around it: the nearest look-alike within `SHIFT_TOLERANCE` px. */
  const changeMemo = new Float32Array(width * height).fill(-1);
  const changeAt = (x: number, y: number) => {
    const p = y * width + x;
    if (changeMemo[p] >= 0) return changeMemo[p];
    const i = p * 4;
    let best = Infinity;
    for (let dy = -SHIFT_TOLERANCE; dy <= SHIFT_TOLERANCE && best > 0; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= height) continue;
      for (let dx = -SHIFT_TOLERANCE; dx <= SHIFT_TOLERANCE; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        const j = (yy * width + xx) * 4;
        const d = Math.max(Math.abs(E[i] - O[j]), Math.abs(E[i + 1] - O[j + 1]), Math.abs(E[i + 2] - O[j + 2]));
        if (d < best) best = d;
      }
    }
    changeMemo[p] = best;
    return best;
  };

  /** Whose gem an answer point is: the nearest gem centre (in half-sizes) among the gems and the marks. */
  const readOwner = (x: number, y: number) => {
    let best = -1;
    let bestDistance = Infinity;
    seats.forEach((s, k) => {
      const d = Math.hypot(x - s.cx, y - s.cy) / s.radius;
      if (d < bestDistance) {
        bestDistance = d;
        best = k;
      }
    });
    return best;
  };

  /** How much of the answer a point read for gem `k` keeps (0–1). */
  const matteAt = (k: number, ax: number, ay: number) => {
    const s = seats[k];
    const fromCentre = Math.hypot(ax - s.cx, ay - s.cy);
    const limit = 1 - smooth((fromCentre - LIMIT * s.radius) / (LIMIT_FADE * s.radius));
    if (limit <= 0) return 0;
    if (readOwner(ax, ay) !== k) return 0;
    const body = 1 - smooth((fromCentre - BODY * s.radius) / (BODY_FADE * s.radius));
    if (body >= 1) return limit;
    // Changed like a gem, softly from half the gem's threshold. Not widened to the next pixel: beside the
    // gem's rim, that pixel is the tooth or the gap, and it would be laid on the photo with the gem.
    const x = Math.round(Math.min(width - 1, Math.max(0, ax)));
    const y = Math.round(Math.min(height - 1, Math.max(0, ay)));
    const change = changeAt(x, y);
    const changed = smooth((change - 0.5 * s.threshold) / (0.5 * s.threshold));
    return limit * Math.max(body, changed);
  };

  // Each gem's colour shift: the answer against the photo on the tooth just outside the gem. Only the
  // tooth: pixels inside any gem's disc, or changed like a gem, are left out — in a tight cluster the ring
  // falls on the neighbouring gems, whose colours (red, or a crystal's grey facets) once tinted the tooth
  // around every gem (a lemon-yellow halo on a heart of small crystals, 2026-11-05). The median, per channel.
  const gemDiscs = seats.map((s) => ({ x: s.cx, y: s.cy, outer: (LIMIT + LIMIT_FADE) * s.radius }));
  const shifts = seats.map((s, k) => {
    const own = gemDiscs[k];
    const band = Math.max(4, 0.6 * s.radius);
    const read = (reach: number, toothOnly: boolean) => {
      const values: [number[], number[], number[]] = [[], [], []];
      const r = own.outer + reach;
      const x0 = Math.max(0, Math.floor(s.cx - r));
      const x1 = Math.min(width - 1, Math.ceil(s.cx + r));
      const y0 = Math.max(0, Math.floor(s.cy - r));
      const y1 = Math.min(height - 1, Math.ceil(s.cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (Math.hypot(x - s.cx, y - s.cy) > r) continue;
          if ((toothOnly ? gemDiscs : [own]).some((d) => Math.hypot(x - d.x, y - d.y) < d.outer)) continue;
          const i = (y * width + x) * 4;
          if (toothOnly && diffAt(i) > s.threshold) continue;
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

  // The photo, with each gem laid on the pixels of its own mark.
  const out = new Uint8ClampedArray(O.subarray(0, width * height * 4));
  usable.forEach((m, k) => {
    const s = seats[k];
    const shift = shifts[k];
    // The gem's disc on the photo: its centre in the answer brought back through the seat.
    const dx = m.x + (s.cx - s.ox) / s.scale;
    const dy = m.y + (s.cy - s.oy) / s.scale;
    const reach = ((LIMIT + LIMIT_FADE) * s.radius) / s.scale + 1;
    const x0 = Math.max(0, Math.floor(dx - reach));
    const x1 = Math.min(width - 1, Math.ceil(dx + reach));
    const y0 = Math.max(0, Math.floor(dy - reach));
    const y1 = Math.min(height - 1, Math.ceil(dy + reach));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (ownerOf(x, y) !== k) continue;
        const ax = s.ox + (x - m.x) * s.scale;
        const ay = s.oy + (y - m.y) * s.scale;
        const g = matteAt(k, ax, ay);
        if (g <= 0) continue;
        const i = (y * width + x) * 4;
        const inPlace = s.scale === 1 && s.ox === m.x && s.oy === m.y;
        for (let c = 0; c < 3; c++) {
          const v = inPlace ? E[i + c] : sample(ax, ay, c);
          out[i + c] = O[i + c] * (1 - g) + (v - shift[c]) * g;
        }
      }
    }
  });
  return { data: out, checks, masked: true, background };
}
