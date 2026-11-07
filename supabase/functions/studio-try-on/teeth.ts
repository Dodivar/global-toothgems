/**
 * Finding each tooth on the mouth close-up (decision 111 (k), 2026-11-01):
 * the first stage of the computed placement. The check model draws a box
 * around every visible tooth and names it by its FDI number; the browser
 * then fits the Studio's reference dentition onto those boxes
 * (`webapp/src/lib/studio3d/tryOnRegistration.ts`) and computes where each
 * gem goes, instead of leaving the image model to decide.
 *
 * Read by the `analyse` call of `handler.ts`, with the photo check's box of
 * the upper central incisors (the midline the browser checks the numbers against).
 *
 * Pure apart from the prompt text: `readTeeth` checks the model's answer like
 * any untrusted input.
 */

export const TEETH_PROMPT = `You locate the teeth on a close-up photo of a person's smile, for a tooth gem try-on.
Report facts only, as JSON matching the schema. Boxes are [ymin, xmin, ymax, xmax] on a 0–1000 scale of THIS image.
- teeth: one entry per tooth whose front surface is visible, upper and lower arch, at most 20.
  - fdi: the tooth's FDI number as a string. Upper arch: 11 central incisor, 12 lateral incisor, 13 canine, 14 and 15 premolars, 16 first molar on the person's RIGHT, which is the LEFT side of the image; 21 to 26 the same on the person's left, the RIGHT side of the image. Lower arch: 41 to 46 on the left side of the image, 31 to 36 on the right side.
  - box: tight around the visible enamel of that one tooth only — never the lips, the gums or the neighbouring teeth. A tooth partly hidden by a lip gets the box of the part that shows.
Count from the middle of the smile outward: the two upper central incisors meet at the middle. Never give two entries the same fdi. Leave out a tooth rather than guess its number. Empty array when no teeth are visible.`;

export const TEETH_SCHEMA = {
  type: "OBJECT",
  properties: {
    teeth: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { fdi: { type: "STRING" }, box: { type: "ARRAY", items: { type: "INTEGER" } } },
        required: ["fdi", "box"],
      },
    },
  },
  required: ["teeth"],
};

/** A tooth found on the image: its FDI number and its box, in the image's pixels. */
export interface FoundTooth {
  fdi: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Front-visible teeth only: incisors to first molars. */
const FDI = /^[1-4][1-6]$/;
const MAX_TEETH = 20;
/** A box narrower or shorter than this share of the image is a misreading, not a tooth. */
const MIN_SHARE = 0.01;

/**
 * The teeth the model reported, in pixels of an image of `size`: valid FDI
 * numbers, boxes inside the image and not degenerate, each number once (the
 * first answer kept), at most `MAX_TEETH`. Anything else is dropped.
 */
export function readTeeth(value: unknown, size: { width: number; height: number }): FoundTooth[] {
  const list = value && typeof value === "object" ? (value as Record<string, unknown>).teeth : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const teeth: FoundTooth[] = [];
  for (const entry of list) {
    if (teeth.length >= MAX_TEETH) break;
    if (!entry || typeof entry !== "object") continue;
    const { fdi, box } = entry as Record<string, unknown>;
    if (typeof fdi !== "string" || !FDI.test(fdi.trim()) || seen.has(fdi.trim())) continue;
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const [ymin, xmin, ymax, xmax] = (box as number[]).map((n) => Math.min(1000, Math.max(0, n)));
    if (xmax - xmin < MIN_SHARE * 1000 || ymax - ymin < MIN_SHARE * 1000) continue;
    seen.add(fdi.trim());
    const x = Math.round((xmin / 1000) * size.width);
    const y = Math.round((ymin / 1000) * size.height);
    teeth.push({
      fdi: fdi.trim(),
      x,
      y,
      width: Math.max(1, Math.round((xmax / 1000) * size.width) - x),
      height: Math.max(1, Math.round((ymax / 1000) * size.height) - y),
    });
  }
  return teeth;
}

/**
 * How many times the close-up may be read for its teeth, at once, and merged
 * (`mergeTeeth`), 2026-11-05: on the trial of that day the same photo gave
 * boxes half a tooth to a whole tooth apart from one analysis to the next.
 * Merging three analyses of the trial (simulated: different runs, different
 * crops) helped two photos and slightly hurt two, about even on average once
 * the midline check runs — not enough to pay two more calls per analysis by
 * default. `TRY_ON_TEETH_READINGS` (1 by default) sets it, to measure on a trial.
 */
export const MAX_TEETH_READINGS = 5;

/** `TRY_ON_TEETH_READINGS` read: 1 to `MAX_TEETH_READINGS`, 1 when missing or malformed. */
export function teethReadings(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_TEETH_READINGS, n) : 1;
}
/** A reading whose midline is farther than this from the readings' median (central incisor widths) is left out of the merge. */
const MIDLINE_SPREAD = 0.35;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Where a reading puts the midline (between 11 and 21) and how wide it finds a central incisor; null without both. */
function midlineOf(teeth: readonly FoundTooth[]): { x: number; width: number } | null {
  const a = teeth.find((t) => t.fdi === "11");
  const b = teeth.find((t) => t.fdi === "21");
  return a && b ? { x: (a.x + a.width + b.x) / 2, width: (a.width + b.width) / 2 } : null;
}

/**
 * One set of teeth from several readings of the same close-up, and how many
 * readings it was taken from: the readings
 * whose midline agrees with the others' (a reading numbering the teeth a
 * tooth off is outvoted), then for each FDI number the median box of the
 * readings that found it — a tooth found by one reading only is dropped when
 * two or more agree. One reading is returned as is.
 */
export function mergeTeeth(readings: readonly FoundTooth[][]): { teeth: FoundTooth[]; kept: number } {
  const usable = readings.filter((r) => r.length > 0);
  if (usable.length <= 1) return { teeth: usable[0] ? [...usable[0]] : [], kept: usable.length };
  const mids = usable.map(midlineOf);
  const known = mids.filter((m): m is { x: number; width: number } => m !== null);
  let kept = usable;
  if (known.length >= 2) {
    const x = median(known.map((m) => m.x));
    const width = median(known.map((m) => m.width));
    kept = usable.filter((_, i) => mids[i] !== null && Math.abs(mids[i]!.x - x) <= MIDLINE_SPREAD * width);
    if (kept.length === 0) kept = usable;
  }
  if (kept.length === 1) return { teeth: [...kept[0]], kept: 1 };
  const order = [...new Set(kept.flatMap((r) => r.map((t) => t.fdi)))];
  const teeth = order.flatMap((fdi) => {
    const boxes = kept.flatMap((r) => r.filter((t) => t.fdi === fdi));
    if (boxes.length < 2) return [];
    const x = Math.round(median(boxes.map((t) => t.x)));
    const y = Math.round(median(boxes.map((t) => t.y)));
    return [{ fdi, x, y, width: Math.max(1, Math.round(median(boxes.map((t) => t.width)))), height: Math.max(1, Math.round(median(boxes.map((t) => t.height)))) }];
  });
  return { teeth, kept: kept.length };
}
