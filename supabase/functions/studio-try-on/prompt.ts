/**
 * The instructions sent to the image model with the smile photo (decision 111).
 *
 * Built from the creation's scene as the DATABASE holds it (never from the
 * browser): one line per gem — tooth, cut, colour, size — so the model is told
 * exactly how many gems go where, instead of guessing it from a picture.
 *
 * FIRST VERSION, to be tuned by the owner once the provider is connected:
 * the wording lives only here (`buildTryOnPrompt`), the tests pin its
 * structure, not its prose.
 */

/** What the prompt needs of a piece; anything else in the scene is ignored. */
export interface PromptPiece {
  toothId: string;
  shape: string;
  material: string;
  color: string;
  effect: string;
  /** "SS5", "2 × 4 mm"… */
  size: string;
  /** Longest side in millimetres, rounded. */
  longestMm: number;
}

const QUADRANT: Record<string, string> = {
  "1": "upper right",
  "2": "upper left",
  "3": "lower left",
  "4": "lower right",
};
const TOOTH: Record<string, string> = {
  "1": "central incisor",
  "2": "lateral incisor",
  "3": "canine",
  "4": "first premolar",
  "5": "second premolar",
  "6": "first molar",
  "7": "second molar",
  "8": "third molar",
};

/** "upper left central incisor (FDI 21)" — the person's own left and right, as dentists count. */
export function toothLabel(toothId: string): string {
  const m = /^([1-4])([1-8])$/.exec(toothId);
  if (!m) return "front tooth surface (unlabelled)";
  return `${QUADRANT[m[1]]} ${TOOTH[m[2]]} (FDI ${toothId})`;
}

const MAX_PIECES = 200;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown, max = 24) => (typeof v === "string" ? v.replace(/[^\w #.-]/g, "").slice(0, max) : "");

function sizeOf(raw: Record<string, unknown>): { size: string; longestMm: number } | null {
  const size = raw.size as Record<string, unknown> | undefined;
  const half = isNum(raw.scale) && raw.scale > 0 ? raw.scale : null;
  const longest = half ? Math.round(half * 2 * 10) / 10 : null;
  if (size && isNum(size.ss)) return { size: `SS${Math.round(size.ss)}`, longestMm: longest ?? 0 };
  if (size && Array.isArray(size.mm) && size.mm.length > 0 && size.mm.every(isNum)) {
    const mm = (size.mm as number[]).slice(0, 2);
    return { size: `${mm.join(" × ")} mm`, longestMm: longest ?? Math.max(...mm) };
  }
  if (isNum(raw.ss)) return { size: `SS${Math.round(raw.ss)}`, longestMm: longest ?? 0 };
  return longest ? { size: `${longest} mm`, longestMm: longest } : null;
}

/** The gems of a stored scene, as the prompt describes them; malformed pieces are dropped. */
export function piecesFromScene(scene: unknown): PromptPiece[] {
  const pieces = scene && typeof scene === "object" ? (scene as Record<string, unknown>).pieces : null;
  if (!Array.isArray(pieces)) return [];
  const out: PromptPiece[] = [];
  for (const raw of pieces.slice(0, MAX_PIECES)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const look = (p.look && typeof p.look === "object" ? p.look : {}) as Record<string, unknown>;
    const size = sizeOf(p);
    const color = typeof look.color === "string" && /^#[0-9a-f]{6}$/i.test(look.color) ? look.color.toLowerCase() : null;
    if (typeof p.toothId !== "string" || !size || !color) continue;
    out.push({
      toothId: p.toothId.slice(0, 4),
      shape: text(look.shape) || "round",
      material: text(look.material) || "crystal",
      color,
      effect: text(look.effect),
      ...size,
    });
  }
  return out;
}

export interface PromptInput {
  pieces: PromptPiece[];
  /** How many reference pictures follow the photo (the owner's own, from the bucket). */
  referenceCount: number;
  /** Whether the browser's front view of the creation is attached. */
  withDesign: boolean;
}

export function buildTryOnPrompt({ pieces, referenceCount, withDesign }: PromptInput): string {
  const lines = pieces.map((p, i) => {
    const look = [p.color, p.material, p.effect && p.effect !== "none" ? p.effect : ""].filter(Boolean).join(" ");
    const mm = p.longestMm > 0 ? `, about ${p.longestMm} mm on its longest side` : "";
    return `${i + 1}. ${toothLabel(p.toothId)}: one ${p.shape} tooth gem, ${look}, size ${p.size}${mm}.`;
  });
  const images = [
    "Image 1 is a photo of a real person's smile.",
    withDesign ? "Image 2 is a front view of the tooth gem design to apply (the gems' layout on the teeth)." : "",
    referenceCount > 0
      ? `The ${referenceCount} last image${referenceCount > 1 ? "s are" : " is"} reference photo${referenceCount > 1 ? "s" : ""} of real tooth gems worn on teeth, for realism only (light, reflections, scale) — do not copy their layout.`
      : "",
  ].filter(Boolean);
  return [
    "Edit image 1: add tooth gems bonded to the front surface of the teeth, exactly as listed below, and nothing else.",
    ...images,
    "",
    `Exactly ${pieces.length} gem${pieces.length > 1 ? "s" : ""}:`,
    ...lines,
    "",
    "Rules:",
    "- Keep the person, the face, the lips, the skin, the teeth's shape and colour, the framing and the background exactly as in image 1.",
    "- Add no gem that is not listed, never move a gem to another tooth, keep each gem's colour, cut and size.",
    "- Left and right are the person's own (an upper left tooth appears on the right of a front-facing photo).",
    "- Real scale: an incisor is about 8 to 9 mm wide; a gem is small and flat on the enamel.",
    "- Photorealistic result: the gems catch the light of the photo, with soft reflections and contact shadows.",
    "- Return one edited image, same framing and aspect ratio as image 1.",
  ].join("\n");
}
