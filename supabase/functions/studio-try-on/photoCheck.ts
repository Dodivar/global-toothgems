/**
 * The photo check before a try-on render (decision 111, 2026-10-26): a small
 * text model (TRY_ON_CHECK_MODEL, `gemini-3.1-flash-lite` by default) looks at
 * the smile photo and answers a few facts as JSON — teeth visible or covered,
 * the box around the visible teeth, sharpness, light. The verdict is decided
 * HERE, by fixed thresholds (`judgePhoto`), never by the model: a photo is
 * refused only for a clear reason, and any fact the model did not give
 * clearly is not held against it (no false refusal for a doubt).
 *
 * The main reason to refuse is a smile too small in the picture: the image
 * model answers at about 1K whatever it receives, so gems on teeth that fill
 * a fifth of the photo come out as a few pixels. Refused photos cost one
 * cheap call and never the image generation.
 */

export const DEFAULT_CHECK_MODEL = "gemini-3.1-flash-lite";

/**
 * The visible teeth must span at least this share of the photo's LONGER
 * side. A first estimate from the owner's test photos (2026-10-26): a selfie
 * of the whole face (about 0.21) is refused, a closer smile (about 0.32)
 * passes. Each check logs its measure, so it can be tuned on real photos.
 */
export const MIN_TEETH_SPAN = 0.25;

export const PHOTO_ISSUES = ["too_far", "no_teeth", "teeth_hidden", "too_dark", "too_bright", "blurry"] as const;
export type PhotoIssue = (typeof PHOTO_ISSUES)[number];

export const PHOTO_CHECK_PROMPT = `You check a photo before a tooth gem try-on: gems will be drawn on the person's front teeth.
Look at the photo and report facts only, as JSON matching the schema:
- teeth_visible: true when front teeth (incisors) are clearly visible — lips apart, a smile or open mouth.
- teeth_covered: true only when something hides most of the front teeth: a hand, an object, a phone, hair, a mask.
- teeth_box: the box around ALL the visible teeth together (not the lips, not the face), as [ymin, xmin, ymax, xmax] on a 0–1000 scale of the image. Empty array when no teeth are visible.
- sharpness: "sharp", "slightly_blurred" (soft but the teeth edges are readable) or "blurred" (the teeth edges cannot be told apart).
- lighting: "good", "dim" (darker but the teeth are readable), "too_dark" (the teeth are hard to see) or "overexposed" (the teeth are burnt white, no detail).
Report what you see; when unsure, choose the more favourable value.`;

/** Gemini's `responseSchema` (OpenAPI subset). */
export const PHOTO_CHECK_SCHEMA = {
  type: "OBJECT",
  properties: {
    teeth_visible: { type: "BOOLEAN" },
    teeth_covered: { type: "BOOLEAN" },
    teeth_box: { type: "ARRAY", items: { type: "INTEGER" } },
    sharpness: { type: "STRING", enum: ["sharp", "slightly_blurred", "blurred"] },
    lighting: { type: "STRING", enum: ["good", "dim", "too_dark", "overexposed"] },
  },
  required: ["teeth_visible", "teeth_covered", "teeth_box", "sharpness", "lighting"],
};

export interface PhotoVerdict {
  issues: PhotoIssue[];
  /** The visible teeth's span over the photo's longer side, when measured (logged, for tuning). */
  span: number | null;
}

/**
 * The verdict on the model's answer. `size`: the photo's pixel size, when
 * known; without it the span is measured against the image's width.
 */
export function judgePhoto(answer: Record<string, unknown>, size: { width: number; height: number } | null): PhotoVerdict {
  const issues: PhotoIssue[] = [];
  if (answer.teeth_visible === false) return { issues: ["no_teeth"], span: null };
  if (answer.teeth_covered === true) issues.push("teeth_hidden");
  if (answer.lighting === "too_dark") issues.push("too_dark");
  if (answer.lighting === "overexposed") issues.push("too_bright");
  if (answer.sharpness === "blurred") issues.push("blurry");

  let span: number | null = null;
  const box = answer.teeth_box;
  if (Array.isArray(box) && box.length === 4 && box.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000)) {
    const [ymin, xmin, ymax, xmax] = box as number[];
    if (xmax > xmin && ymax > ymin) {
      const share = (xmax - xmin) / 1000;
      span = size && size.width > 0 && size.height > 0 ? (share * size.width) / Math.max(size.width, size.height) : share;
      span = Math.round(span * 100) / 100;
      if (span < MIN_TEETH_SPAN) issues.push("too_far");
    }
  }
  return { issues, span };
}

/** Width and height read from a JPEG (SOF marker) or PNG (IHDR) header; null for anything else. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}
