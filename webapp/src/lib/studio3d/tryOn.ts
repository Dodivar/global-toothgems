import type { Creation } from "../studioWorkspace/types";
import { parseTryOnCrop, type TryOnCrop } from "./tryOnComposite";
import type { FoundTooth } from "./tryOnRegistration";
import type { TryOnSeat } from "./tryOnSeats";

/**
 * "Try it on a smile": a Studio creation on a photo of a smile, rendered by an
 * image model (Google's "Nano Banana 2", decision 111) behind the Edge
 * Function `studio-try-on` — the provider's key never reaches the browser.
 *
 * The browser sends the prepared photo, the creation's front view drawn here
 * (IMAGE 1 and IMAGE 2 of the owner's system instructions, `systemPrompt.ts`
 * in the function) and a REFERENCE to the creation: the function reads the
 * creation and the owner's plan switch from the database. The
 * answer is a generated image, read through `parseTryOnResponse` like any
 * untrusted input. Nothing is stored: the photo and the image only pass
 * through the function's memory.
 *
 * While the owner has not connected the provider, the function says so
 * (`status()` → not available, `render()` → `not_available`): the dialog says the
 * AI render is coming and sends nothing — never a made-up result.
 */

/** What the try-on needs of a creation: its name (titles, file names) and its scene (the front view). */
export type TryOnCreation = Pick<Creation, "name" | "scene">;

/** Which creation, as the function finds it: one's own, behind a share link, or on a public Glowbook. */
export type TryOnSource =
  | { kind: "own"; creationId: string }
  | { kind: "share"; token: string }
  | { kind: "glowbook"; handle: string; itemId: string };

/** Who is trying it on: the artist with a client's photo, or a visitor on their own smile. */
export type TryOnAudience = "artist" | "visitor";

export interface TryOnRenderRequest {
  /** The prepared photo (oriented, downscaled, metadata stripped). */
  photo: Blob;
  source: TryOnSource;
  /** The creation rendered in 3D from the front, in the browser (`renderDesignImages`), framed on the gems. */
  design: Blob;
  /** The same design seen from further away, the whole smile around the gems (`renderDesignImages`). */
  overview?: Blob | null;
  /** The flat design map (`tryOnMap`, PNG): every tooth labelled, every gem tagged like the design data. */
  map?: Blob | null;
  /** Each gem's place and size on its tooth (`tryOnSeats`), read by the AI as text. */
  seats?: readonly TryOnSeat[];
  /**
   * The computed placement (decision 111 (k), active staff only): the close-up
   * with the gems drawn as marks (`renderPlacementGuide`), where it was cut, and
   * how many marks it holds. The model then only makes the marks real.
   */
  placement?: { guide: Blob; crop: TryOnCrop; marks: number };
}

export const TRY_ON_ERROR_CODES = [
  "not_available",
  "sign_in_required",
  "not_found",
  "not_allowed",
  "daily_limit",
  "photo_unsuitable",
  "blocked",
  "network",
  "failed",
] as const;
export type TryOnErrorCode = (typeof TRY_ON_ERROR_CODES)[number];

/**
 * Why the function's photo check refused a photo (`photo_unsuitable`,
 * `photoCheck.ts` in the function): each one has a message saying what to change.
 */
export const PHOTO_ISSUES = ["too_far", "not_frontal", "no_teeth", "teeth_hidden", "too_dark", "too_bright", "blurry", "design_hidden"] as const;
export type PhotoIssue = (typeof PHOTO_ISSUES)[number];

/** Where a render is, as the function reports it: the photo check, then the AI render. */
export type TryOnStage = "checking" | "rendering";

/**
 * `crop`: the image is the edited mouth close-up, to paste back into the photo there (`tryOnComposite.ts`).
 * `leftOut`: gems not drawn because their spot does not show on the photo (said under the result).
 */
export type TryOnOutcome = { ok: true; image: Blob; crop?: TryOnCrop; leftOut?: number } | { ok: false; code: TryOnErrorCode; reasons?: PhotoIssue[] };

/**
 * The signed-in member's daily allowance of AI renders (over the last 24
 * hours, counted by the function): `unlimited` for an active administrator.
 * Display only — the function counts again on every render.
 */
export type TryOnQuota = { unlimited: true } | { unlimited: false; limit: number; remaining: number };

export interface TryOnStatus {
  /** Whether the AI is connected. */
  available: boolean;
  /** Renders per account per 24 hours, for visitors who are not signed in yet; null if unknown. */
  dailyLimit: number | null;
  /** The caller's own allowance; null when not signed in or unknown. */
  quota: TryOnQuota | null;
  /** Whether the caller may ask for the placement diagnostic (active staff, decided by the function). */
  diagnostic: boolean;
}

export const UNAVAILABLE_STATUS: TryOnStatus = { available: false, dailyLimit: null, quota: null, diagnostic: false };

const count = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000 ? v : null);

/** Read the function's status answer (`{ available, daily_limit, quota }`) like any untrusted input. */
export function parseTryOnStatus(json: unknown): TryOnStatus {
  if (!json || typeof json !== "object") return UNAVAILABLE_STATUS;
  const data = json as Record<string, unknown>;
  const raw = data.quota && typeof data.quota === "object" ? (data.quota as Record<string, unknown>) : null;
  let quota: TryOnQuota | null = null;
  if (raw?.unlimited === true) quota = { unlimited: true };
  else if (raw) {
    const limit = count(raw.limit);
    const remaining = count(raw.remaining);
    if (limit !== null && limit > 0 && remaining !== null) quota = { unlimited: false, limit, remaining: Math.min(remaining, limit) };
  }
  const dailyLimit = count(data.daily_limit);
  return {
    available: data.available === true,
    dailyLimit: dailyLimit && dailyLimit > 0 ? dailyLimit : null,
    quota,
    diagnostic: data.available === true && data.diagnostic === true,
  };
}

/**
 * The staff's placement diagnostic (decision 111 (k)): the mouth close-up the
 * function cut and each tooth it found there, boxes in the close-up's pixels.
 */
export interface TryOnAnalysis {
  crop: TryOnCrop;
  teeth: FoundTooth[];
}

export type TryOnAnalysisOutcome = { ok: true; analysis: TryOnAnalysis } | { ok: false; code: TryOnErrorCode; reasons?: PhotoIssue[] };

export interface SmileTryOnService {
  /**
   * Whether the AI is connected, and the caller's daily allowance. Asked
   * before any photo leaves the device; never throws (unavailable).
   */
  status(): Promise<TryOnStatus>;
  /**
   * Render the creation on the photo. Never throws: every failure is an error
   * code. An aborted call (cancelled, dialog closed) resolves with `failed`;
   * the caller ignores it. `onStage` follows the function's progress: the
   * photo check, then the render once the photo passed.
   */
  render(request: TryOnRenderRequest, options?: { signal?: AbortSignal; onStage?: (stage: TryOnStage) => void }): Promise<TryOnOutcome>;
  /**
   * The placement diagnostic, active staff only (the function refuses anyone
   * else): the teeth found on the photo, no image generated. Never throws.
   */
  analyse?(request: { photo: Blob; source: TryOnSource }, options?: { signal?: AbortSignal }): Promise<TryOnAnalysisOutcome>;
}

/** Used without a backend (mock mode): the AI is simply not there. */
export const unavailableTryOnService: SmileTryOnService = {
  status: async () => UNAVAILABLE_STATUS,
  render: async () => ({ ok: false, code: "not_available" }),
  analyse: async () => ({ ok: false, code: "not_available" }),
};

/** The `source` field the function reads (`readSourceRef` in the function). */
export function sourcePayload(source: TryOnSource): Record<string, string> {
  switch (source.kind) {
    case "own":
      return { creation_id: source.creationId };
    case "share":
      return { token: source.token };
    case "glowbook":
      return { handle: source.handle, item_id: source.itemId };
  }
}

/* ------------------------------------------------- reading the answer */

/** A generated image above this (decoded) is refused. */
const RESULT_MAX_BYTES = 15 * 1024 * 1024;
const RESULT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const isCode = (v: unknown): v is TryOnErrorCode => typeof v === "string" && (TRY_ON_ERROR_CODES as readonly string[]).includes(v);

/** The function's codes that the dialog does not tell apart. */
const ALIASES: Record<string, TryOnErrorCode> = { session_expired: "sign_in_required", invalid_request: "failed", server_error: "failed" };

/**
 * Read the function's answer: `{ ok: true, image: { mime_type, data } }`
 * (base64) or `{ ok: false, code }`. An image of another type, too large or
 * not valid base64 is `failed`.
 */
export function parseTryOnResponse(json: unknown): TryOnOutcome {
  if (!json || typeof json !== "object") return { ok: false, code: "failed" };
  const data = json as Record<string, unknown>;
  if (data.ok !== true) return readFailure(data);
  const image = (data.image && typeof data.image === "object" ? data.image : {}) as Record<string, unknown>;
  const type = image.mime_type;
  const b64 = image.data;
  if (typeof type !== "string" || !RESULT_TYPES.has(type) || typeof b64 !== "string" || b64.length === 0) return { ok: false, code: "failed" };
  if ((b64.length * 3) / 4 > RESULT_MAX_BYTES || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, code: "failed" };
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const crop = parseTryOnCrop(data.crop);
    const leftOut = count(data.left_out);
    return { ok: true, image: new Blob([bytes], { type }), ...(crop ? { crop } : {}), ...(leftOut ? { leftOut } : {}) };
  } catch {
    return { ok: false, code: "failed" };
  }
}

/** A refusal of the function (`{ ok: false, code, reasons? }`), its code narrowed to the dialog's. */
function readFailure(data: Record<string, unknown>): { ok: false; code: TryOnErrorCode; reasons?: PhotoIssue[] } {
  const code = typeof data.code === "string" ? (ALIASES[data.code] ?? data.code) : null;
  if (code === "photo_unsuitable") {
    const reasons = Array.isArray(data.reasons) ? PHOTO_ISSUES.filter((issue) => (data.reasons as unknown[]).includes(issue)) : [];
    return { ok: false, code, reasons };
  }
  return { ok: false, code: isCode(code) ? code : "failed" };
}

const TOOTH_FDI = /^[1-4][1-6]$/;
const MAX_TEETH = 20;

/**
 * Read the placement diagnostic's answer (`{ ok: true, crop, teeth }`):
 * a crop inside its photo, and teeth with a front-tooth FDI number and a box
 * inside the crop — the others are dropped, a missing crop is `failed`.
 */
export function parseTryOnAnalysis(json: unknown): TryOnAnalysisOutcome {
  if (!json || typeof json !== "object") return { ok: false, code: "failed" };
  const data = json as Record<string, unknown>;
  if (data.ok !== true) return readFailure(data);
  const crop = parseTryOnCrop(data.crop);
  if (!crop) return { ok: false, code: "failed" };
  const seen = new Set<string>();
  const teeth = (Array.isArray(data.teeth) ? data.teeth : []).flatMap((raw): FoundTooth[] => {
    if (!raw || typeof raw !== "object") return [];
    const { fdi, x, y, width, height } = raw as Record<string, unknown>;
    if (typeof fdi !== "string" || !TOOTH_FDI.test(fdi) || seen.has(fdi)) return [];
    if (![x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n))) return [];
    const [bx, by, bw, bh] = [x, y, width, height] as number[];
    if (bx < 0 || by < 0 || bw <= 0 || bh <= 0 || bx + bw > crop.width + 1 || by + bh > crop.height + 1) return [];
    seen.add(fdi);
    return [{ fdi, x: bx, y: by, width: bw, height: bh }];
  });
  return { ok: true, analysis: { crop, teeth: teeth.slice(0, MAX_TEETH) } };
}

/**
 * One event of the function's progress stream (`data: <json>`, `progress=1`):
 * a stage, or the final answer read by `parseTryOnResponse`. Anything else
 * (comments, unknown stages, broken JSON) is null and skipped.
 */
export function parseTryOnEvent(chunk: string): { stage: TryOnStage } | { outcome: TryOnOutcome } | null {
  const line = chunk.split("\n").find((l) => l.startsWith("data:"));
  if (!line) return null;
  let event: unknown;
  try {
    event = JSON.parse(line.slice(5));
  } catch {
    return null;
  }
  if (!event || typeof event !== "object") return null;
  const data = event as Record<string, unknown>;
  if ("result" in data) return { outcome: parseTryOnResponse(data.result) };
  return data.stage === "checking" || data.stage === "rendering" ? { stage: data.stage } : null;
}

/* ------------------------------------------------------- the interface */

/** Locale keys (under `studio.tryOn.errors`) for each error code: a title and what to do. */
export const TRY_ON_ERROR_MESSAGES: Record<TryOnErrorCode, { title: string; body: string }> = Object.fromEntries(
  TRY_ON_ERROR_CODES.map((code) => [code, { title: `studio.tryOn.errors.${code}.title`, body: `studio.tryOn.errors.${code}.body` }]),
) as Record<TryOnErrorCode, { title: string; body: string }>;

/** The file extension of a generated image's type. */
export function resultExtension(type: string): "jpg" | "png" | "webp" {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

/** Whether trying again can help (a passing failure), as opposed to another photo or nothing. */
export function errorAllowsRetry(code: TryOnErrorCode): boolean {
  return code === "network" || code === "failed";
}
