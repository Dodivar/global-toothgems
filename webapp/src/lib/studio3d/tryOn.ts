import type { Creation } from "../studioWorkspace/types";

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
 * (`status()` → false, `render()` → `not_available`): the dialog says the
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
  /** The creation's front view, drawn in the browser (`renderDesignImage`). */
  design: Blob;
}

export const TRY_ON_ERROR_CODES = [
  "not_available",
  "sign_in_required",
  "not_found",
  "not_allowed",
  "daily_limit",
  "blocked",
  "network",
  "failed",
] as const;
export type TryOnErrorCode = (typeof TRY_ON_ERROR_CODES)[number];

export type TryOnOutcome = { ok: true; image: Blob } | { ok: false; code: TryOnErrorCode };

export interface SmileTryOnService {
  /** Whether the AI is connected. Asked before any photo leaves the device; never throws (false). */
  status(): Promise<boolean>;
  /**
   * Render the creation on the photo. Never throws: every failure is an error
   * code. An aborted call (cancelled, dialog closed) resolves with `failed`;
   * the caller ignores it.
   */
  render(request: TryOnRenderRequest, options?: { signal?: AbortSignal }): Promise<TryOnOutcome>;
}

/** Used without a backend (mock mode): the AI is simply not there. */
export const unavailableTryOnService: SmileTryOnService = {
  status: async () => false,
  render: async () => ({ ok: false, code: "not_available" }),
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
export const RESULT_MAX_BYTES = 15 * 1024 * 1024;
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
  if (data.ok !== true) {
    const code = typeof data.code === "string" ? (ALIASES[data.code] ?? data.code) : null;
    return { ok: false, code: isCode(code) ? code : "failed" };
  }
  const image = (data.image && typeof data.image === "object" ? data.image : {}) as Record<string, unknown>;
  const type = image.mime_type;
  const b64 = image.data;
  if (typeof type !== "string" || !RESULT_TYPES.has(type) || typeof b64 !== "string" || b64.length === 0) return { ok: false, code: "failed" };
  if ((b64.length * 3) / 4 > RESULT_MAX_BYTES || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, code: "failed" };
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ok: true, image: new Blob([bytes], { type }) };
  } catch {
    return { ok: false, code: "failed" };
  }
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
