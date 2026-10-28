/**
 * The photo check before a try-on render (decision 111, 2026-10-26): a small
 * text model (TRY_ON_CHECK_MODEL, `gemini-3.1-flash-lite` by default) looks at
 * the smile photo and answers a few facts as JSON — teeth visible or covered,
 * the box around the visible teeth, sharpness, light, how the smile faces
 * the camera and whether both upper central incisors face it. The verdict is decided
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

/** `design_hidden`: not one gem of the design has its spot visible in this photo (`placeableGems`). */
export const PHOTO_ISSUES = ["too_far", "not_frontal", "no_teeth", "teeth_hidden", "too_dark", "too_bright", "blurry", "design_hidden"] as const;
export type PhotoIssue = (typeof PHOTO_ISSUES)[number];

export const PHOTO_CHECK_PROMPT = `You check a photo before a tooth gem try-on: gems will be drawn on the person's front teeth.
Look at the photo and report facts only, as JSON matching the schema:
- teeth_visible: true when front teeth (incisors) are clearly visible — lips apart, a smile or open mouth.
- teeth_covered: true only when something hides most of the front teeth: a hand, an object, a phone, hair, a mask.
- teeth_box: the box around ALL the visible teeth together (not the lips, not the face), as [ymin, xmin, ymax, xmax] on a 0–1000 scale of the image. Empty array when no teeth are visible.
- central_incisors_box: the box around the two upper central incisors together — the two front teeth on either side of the middle of the smile, from the outer edge of one to the outer edge of the other, from the gum line to the biting edge — as [ymin, xmin, ymax, xmax] on the same 0–1000 scale. Empty array when they are not both visible.
- sharpness: "sharp", "slightly_blurred" (soft but the teeth edges are readable) or "blurred" (the teeth edges cannot be told apart).
- lighting: "good", "dim" (darker but the teeth are readable), "too_dark" (the teeth are hard to see) or "overexposed" (the teeth are burnt white, no detail).
- head_pose: how the smile faces the camera — "frontal" (facing it), "slightly_turned" (a little to one side, up or down, the front teeth still face the camera) or "strongly_turned" (a three-quarter view or a steep angle from below or above: the front teeth are seen at a slant and one side of the smile is much more visible than the other).
- central_incisors_visible: true when BOTH upper central incisors (the two front teeth on either side of the middle of the smile) are clearly visible and face the camera; false when one of them is hidden, cut off or seen edge-on.
- gem_spots: when the text after the photo lists GEM SPOTS, one entry per spot, with its id and placeable. Empty array when no spots are listed. placeable is false only when that spot of that tooth's front surface is clearly NOT visible enamel in this photo: covered by a lip, hidden behind the upper teeth (the biting edge of the lower teeth often is), cut off by the photo's edge, the tooth itself hidden or missing — or when the enamel seen there is clearly too small to hold a gem of that size. On a lower tooth the gum line is at the BOTTOM of the crown and the biting edge at the top.
Report what you see; when unsure, choose the more favourable value.`;

/** Gemini's `responseSchema` (OpenAPI subset). */
export const PHOTO_CHECK_SCHEMA = {
  type: "OBJECT",
  properties: {
    teeth_visible: { type: "BOOLEAN" },
    teeth_covered: { type: "BOOLEAN" },
    teeth_box: { type: "ARRAY", items: { type: "INTEGER" } },
    central_incisors_box: { type: "ARRAY", items: { type: "INTEGER" } },
    sharpness: { type: "STRING", enum: ["sharp", "slightly_blurred", "blurred"] },
    lighting: { type: "STRING", enum: ["good", "dim", "too_dark", "overexposed"] },
    head_pose: { type: "STRING", enum: ["frontal", "slightly_turned", "strongly_turned"] },
    central_incisors_visible: { type: "BOOLEAN" },
    gem_spots: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { id: { type: "STRING" }, placeable: { type: "BOOLEAN" } }, required: ["id", "placeable"] },
    },
  },
  required: ["teeth_visible", "teeth_covered", "teeth_box", "central_incisors_box", "sharpness", "lighting", "head_pose", "central_incisors_visible", "gem_spots"],
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
  // A smile seen at a slant loses its middle line: the image model then puts the gems on the wrong teeth
  // and adds some (owner's tests, 2026-10-26). Only a face-on smile with both front teeth facing the camera passes:
  // "slightly_turned" was let through at first and still gave wrong renders, so the owner tightened it the same day.
  if (answer.head_pose !== undefined && answer.head_pose !== "frontal") issues.push("not_frontal");
  else if (answer.central_incisors_visible === false) issues.push("not_frontal");
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

/** Width of the two upper central incisors together, in millimetres (about 8.5 mm each). */
export const CENTRAL_INCISORS_MM = 17;

/**
 * The photo's scale, from the two upper central incisors: one millimetre as a
 * share of the photo's width — so the image model can be told how long each
 * gem should be in THIS photo (2026-10-26: without it, gems kept the same size
 * whatever the size of the smile). Null when the box is missing or implausible
 * (too small, too large, or not shaped like two front teeth).
 */
export function photoScale(answer: Record<string, unknown>, size: { width: number; height: number } | null): number | null {
  const box = answer.central_incisors_box;
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000)) return null;
  const [ymin, xmin, ymax, xmax] = box as number[];
  const share = (xmax - xmin) / 1000;
  if (!(ymax > ymin) || share < 0.02 || share > 0.8) return null;
  if (size && size.width > 0 && size.height > 0) {
    // Two front teeth: about 17 mm wide, 6–12 mm of crown seen.
    const ratio = ((ymax - ymin) * size.height) / ((xmax - xmin) * size.width);
    if (ratio < 0.2 || ratio > 1.5) return null;
  }
  return share / CENTRAL_INCISORS_MM;
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
