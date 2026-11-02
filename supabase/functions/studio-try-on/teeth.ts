/**
 * Finding each tooth on the mouth close-up (decision 111 (k), 2026-11-01):
 * the first stage of the computed placement. The check model draws a box
 * around every visible tooth and names it by its FDI number; the browser
 * then fits the Studio's reference dentition onto those boxes
 * (`webapp/src/lib/studio3d/tryOnRegistration.ts`) and computes where each
 * gem goes, instead of leaving the image model to decide.
 *
 * For now only the staff's placement diagnostic reads it (the `analyse` call
 * of `handler.ts`): renders still place the gems the current way.
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
