import type { StudioShape } from "../../data/studioEditor";
import { sizeLongestMm } from "../gemOptions";
import type { Creation } from "../studioWorkspace/types";

/**
 * "Try on a client's smile photo": the contract between the Studio and the
 * service that will place a saved creation's gems on a photo of a smile.
 *
 * NOT CONNECTED YET. The only implementation shipped is
 * `unavailableTryOnService`, which answers `not_available`: the interface then
 * says automatic placement is coming and lets the artist place the creation
 * by hand. No placement is ever simulated.
 *
 * Where the real one will run: in a Supabase Edge Function (the AI provider's
 * secret must never reach the browser). The browser implementation will post
 * the prepared photo and `TryOnCreationInput` to it and pass the JSON it
 * answers through `parseTryOnResponse` — the function's answer is untrusted
 * input like any other. Everything crossing that boundary is therefore plain,
 * serialisable data: no `Creation` (it carries the owner's id), no DOM types
 * beyond the photo `Blob`.
 *
 * Coordinates are normalised to the photo: x = 0 left edge → 1 right edge,
 * y = 0 top edge → 1 bottom edge, of the photo exactly as sent (already
 * oriented, see `components/studio/tryOn/preparePhoto.ts`).
 */

/** One gem of the creation, as the service needs it: what it is and on which tooth. */
export interface TryOnPieceInput {
  pieceId: string;
  /** FDI tooth number ("11", "21"…), or "X0" for a piece on an unlabelled region. */
  toothId: string;
  /** Longest side, in millimetres (an SS gauge's approximate diameter for a round stone). */
  sizeMm: number;
  shape: StudioShape;
  /** `#rrggbb`. */
  color: string;
  /** Spin on the tooth, degrees. */
  rotation: number;
}

export interface TryOnCreationInput {
  creationId: string;
  pieces: TryOnPieceInput[];
}

export interface TryOnRequest {
  /** The prepared photo (oriented, downscaled, metadata stripped). */
  photo: Blob;
  photoWidth: number;
  photoHeight: number;
  creation: TryOnCreationInput;
}

/** Where one gem goes on the photo. */
export interface TryOnGemPlacement {
  pieceId: string;
  /** Centre, normalised to the photo (0..1). */
  x: number;
  y: number;
  /** The gem's diameter as a fraction of the photo's width. */
  scale: number;
  /** In-plane rotation, degrees, clockwise. */
  rotation: number;
}

/** A tooth the service recognised: its FDI number and the centre of its visible face. */
export interface TryOnToothLandmark {
  toothId: string;
  x: number;
  y: number;
}

export interface TryOnResult {
  placements: TryOnGemPlacement[];
  landmarks: TryOnToothLandmark[];
  /** 0..1: how sure the service is of the whole placement. */
  confidence: number;
}

export const TRY_ON_ERROR_CODES = ["not_available", "no_smile_detected", "low_quality", "teeth_not_visible", "failed"] as const;
export type TryOnErrorCode = (typeof TRY_ON_ERROR_CODES)[number];

export type TryOnOutcome = { ok: true; result: TryOnResult } | { ok: false; code: TryOnErrorCode };

export interface SmileTryOnService {
  /**
   * Place the creation's gems on the photo. Never throws: every failure is an
   * error code. An aborted call (the artist cancelled or closed the dialog)
   * resolves with `failed`; the caller ignores it.
   */
  placeCreation(request: TryOnRequest, options?: { signal?: AbortSignal }): Promise<TryOnOutcome>;
}

/**
 * The service shipped today: automatic placement is not connected, so it says
 * so at once — no delay, no made-up result.
 */
export const unavailableTryOnService: SmileTryOnService = {
  placeCreation: async () => ({ ok: false, code: "not_available" }),
};

/** What the service is told about a creation — its pieces only, never the record (owner, prices, notes). */
export function tryOnInputFromCreation(creation: Pick<Creation, "id" | "scene">): TryOnCreationInput {
  return {
    creationId: creation.id,
    pieces: creation.scene.pieces.map((p) => ({
      pieceId: p.id,
      toothId: p.toothId,
      sizeMm: sizeLongestMm(p.size),
      shape: p.look.shape,
      color: p.look.color,
      rotation: p.rotation,
    })),
  };
}

/* ------------------------------------------------- reading the answer */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const isCode = (v: unknown): v is TryOnErrorCode => typeof v === "string" && (TRY_ON_ERROR_CODES as readonly string[]).includes(v);

/**
 * Read the service's JSON answer: `{ ok: false, code }` or
 * `{ ok: true, placements, landmarks, confidence }`. Placements for pieces
 * the creation does not have, out of the photo or malformed are dropped; an
 * answer that keeps none is `failed` — the artist then places by hand.
 */
export function parseTryOnResponse(json: unknown, pieceIds: readonly string[]): TryOnOutcome {
  if (!json || typeof json !== "object") return { ok: false, code: "failed" };
  const data = json as Record<string, unknown>;
  if (data.ok !== true) return { ok: false, code: isCode(data.code) ? data.code : "failed" };

  const known = new Set(pieceIds);
  const seen = new Set<string>();
  const placements: TryOnGemPlacement[] = [];
  for (const raw of Array.isArray(data.placements) ? data.placements : []) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.pieceId !== "string" || !known.has(p.pieceId) || seen.has(p.pieceId)) continue;
    if (!isNum(p.x) || !isNum(p.y) || !isNum(p.scale) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
    if (p.scale <= 0 || p.scale > 0.5) continue;
    seen.add(p.pieceId);
    placements.push({ pieceId: p.pieceId, x: p.x, y: p.y, scale: p.scale, rotation: isNum(p.rotation) ? normalizeDegrees(p.rotation) : 0 });
  }
  if (placements.length === 0) return { ok: false, code: "failed" };

  const landmarks: TryOnToothLandmark[] = [];
  for (const raw of Array.isArray(data.landmarks) ? data.landmarks : []) {
    if (!raw || typeof raw !== "object") continue;
    const l = raw as Record<string, unknown>;
    if (typeof l.toothId !== "string" || !/^(X0|[1-4][1-8])$/.test(l.toothId) || !isNum(l.x) || !isNum(l.y)) continue;
    landmarks.push({ toothId: l.toothId, x: clamp01(l.x), y: clamp01(l.y) });
  }

  return { ok: true, result: { placements, landmarks, confidence: isNum(data.confidence) ? clamp01(data.confidence) : 0 } };
}

export function normalizeDegrees(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}

/* ------------------------------------------------------- the interface */

/** Locale keys (under `studio.tryOn.errors`) for each error code: a title and what to do. */
export const TRY_ON_ERROR_MESSAGES: Record<TryOnErrorCode, { title: string; body: string }> = {
  not_available: { title: "studio.tryOn.errors.not_available.title", body: "studio.tryOn.errors.not_available.body" },
  no_smile_detected: { title: "studio.tryOn.errors.no_smile_detected.title", body: "studio.tryOn.errors.no_smile_detected.body" },
  low_quality: { title: "studio.tryOn.errors.low_quality.title", body: "studio.tryOn.errors.low_quality.body" },
  teeth_not_visible: { title: "studio.tryOn.errors.teeth_not_visible.title", body: "studio.tryOn.errors.teeth_not_visible.body" },
  failed: { title: "studio.tryOn.errors.failed.title", body: "studio.tryOn.errors.failed.body" },
};

/** Whether trying another photo can help (the photo was the problem), as opposed to "place it by hand". */
export function errorSuggestsNewPhoto(code: TryOnErrorCode): boolean {
  return code === "no_smile_detected" || code === "low_quality" || code === "teeth_not_visible";
}
