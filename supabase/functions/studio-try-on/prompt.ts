/**
 * The gems of a creation as the database stores them (decision 111), and the
 * design data that the v2 system instructions (`systemPrompt.ts`) read after
 * the images: one line per gem — tooth, cut, material, colour, coating, size.
 *
 * Everything in it comes from the stored scene, reduced to known values
 * (FDI tooth numbers, the Studio's cuts and materials, `#rrggbb`, numbers):
 * no free text of the artist (name, description) ever reaches the model.
 * The function renders nothing for a creation without a single valid gem.
 */

export interface PromptPiece {
  /** FDI number ("11"…"48"), or "X0" for an unlabelled region. */
  toothId: string;
  shape: string;
  material: "crystal" | "metal";
  color: string;
  iridescent: boolean;
  /** "SS5", "2 × 4 mm"… */
  size: string;
  /** Longest side in millimetres, rounded to a tenth (0 when unknown). */
  longestMm: number;
}

const MAX_PIECES = 200;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The Studio's cuts (`StudioShape`), as the model should picture them. */
const SHAPES: Record<string, string> = {
  round: "round",
  baguette: "baguette (long rectangle)",
  square: "square",
  heart: "heart",
  "open-heart": "open heart (outline only)",
  kite: "kite",
  navette: "navette (marquise)",
  raindrop: "raindrop (pear)",
  triangle: "triangle",
  "rivoli-star": "star (rivoli)",
  starflower: "star flower",
  "halo-star": "open star (outline)",
  bolt: "lightning bolt",
  cherries: "cherries",
  snake: "snake",
  dachshund: "dachshund",
};

function sizeOf(raw: Record<string, unknown>): { size: string; longestMm: number } | null {
  const size = raw.size as Record<string, unknown> | undefined;
  const half = isNum(raw.scale) && raw.scale > 0 && raw.scale < 50 ? raw.scale : null;
  const longest = half ? Math.round(half * 2 * 10) / 10 : null;
  if (size && isNum(size.ss)) return { size: `SS${Math.round(size.ss)}`, longestMm: longest ?? 0 };
  if (size && Array.isArray(size.mm) && size.mm.length > 0 && size.mm.every(isNum)) {
    const mm = (size.mm as number[]).slice(0, 2).map((v) => Math.round(v * 10) / 10);
    return { size: `${mm.join(" × ")} mm`, longestMm: longest ?? Math.max(...mm) };
  }
  if (isNum(raw.ss)) return { size: `SS${Math.round(raw.ss)}`, longestMm: longest ?? 0 };
  return longest ? { size: `${longest} mm`, longestMm: longest } : null;
}

/** The gems of a stored scene, reduced to known values; malformed pieces are dropped. */
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
      toothId: /^(X0|[1-4][1-8])$/.test(p.toothId) ? p.toothId : "X0",
      shape: typeof look.shape === "string" && look.shape in SHAPES ? look.shape : "round",
      material: look.material === "metal" ? "metal" : "crystal",
      color,
      iridescent: look.effect === "iridescent",
      ...size,
    });
  }
  return out;
}

const QUADRANT: Record<string, string> = { "1": "upper right", "2": "upper left", "3": "lower left", "4": "lower right" };
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

/** "21 (upper left central incisor)" — the person's own left and right, as dentists count. */
export function toothLabel(toothId: string): string {
  const m = /^([1-4])([1-8])$/.exec(toothId);
  return m ? `${toothId} (${QUADRANT[m[1]]} ${TOOTH[m[2]]})` : "unlabelled front surface (see the map)";
}

/** The design data block sent after the images with the v2 system instructions. */
export function buildDesignData(pieces: readonly PromptPiece[]): string {
  const lines = pieces.map((p, i) => {
    const mm = p.longestMm > 0 ? ` (about ${p.longestMm} mm on its longest side)` : "";
    const coating = p.iridescent ? " — iridescent coating" : "";
    return `${i + 1}. Tooth ${toothLabel(p.toothId)} — ${SHAPES[p.shape]} — ${p.material} — colour ${p.color}${coating} — size ${p.size}${mm}`;
  });
  return [`DESIGN DATA — ${pieces.length} gem${pieces.length > 1 ? "s" : ""}:`, ...lines].join("\n");
}
