/**
 * The gems of a creation as the database stores them (decision 111): the
 * function renders nothing for a creation without a single valid gem. The
 * render itself is driven by the system instructions (`systemPrompt.ts`) and
 * the images; no text about the gems is sent.
 */

/** What is read of a piece; anything else in the scene is ignored. */
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
