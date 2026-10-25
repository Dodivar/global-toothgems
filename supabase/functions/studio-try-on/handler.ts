import { corsHeaders, json, type SiteOrigins } from "../_shared/http.ts";
import { bearer, looksLikeJwt } from "../_shared/studioBilling.ts";
import type { GenerateOutcome, InlineImage } from "./gemini.ts";
import { piecesFromScene } from "./prompt.ts";

/**
 * POST /functions/v1/studio-try-on   (decision 111)
 *
 * Two calls:
 *
 *   { "action": "status" }  (JSON, no account needed)
 *     200 { available }   whether the AI is connected — the browser asks before
 *                         any photo leaves the device.
 *
 *   multipart/form-data  (the member's token)
 *     source  JSON: { "creation_id" } (one's own creation) | { "token" } (share
 *             link) | { "handle", "item_id" } (approved Glowbook creation)
 *     photo   the smile photo (JPEG / PNG / WebP, ≤ 6 MB), prepared in the browser
 *     design  the browser's front view of the creation (≤ 3 MB): IMAGE 1 of
 *             the system instructions (`systemPrompt.ts`), the photo IMAGE 2
 *     200 { ok: true, image: { mime_type, data } }   base64, never stored
 *     4xx/5xx { ok: false, code }  invalid_request | sign_in_required |
 *             session_expired | not_found | not_allowed | daily_limit |
 *             not_available | blocked | failed | server_error
 *
 * The creation and the owner's plan switch are read from the database
 * (`studio_try_on_creation`), so only a creation the requester may see, and
 * whose owner has the option, is ever rendered; a generation is counted before the provider is
 * called (`studio_try_on_requests`, daily limit per account). The photo and
 * the image only pass through memory.
 */

export type TryOnSourceRef = { creationId: string } | { token: string } | { handle: string; itemId: string };

export interface TryOnCreationRow {
  creationId: string;
  source: "own" | "share" | "glowbook";
  scene: unknown;
  allowed: boolean;
}

export interface StudioTryOnDeps {
  origins: SiteOrigins;
  /** Whether the provider is connected (secrets set). */
  available: boolean;
  dailyLimit: number;
  userFromToken(token: string): Promise<string | null>;
  loadCreation(requester: string, ref: TryOnSourceRef): Promise<TryOnCreationRow | null>;
  countRecent(userId: string, since: Date): Promise<number>;
  startRequest(userId: string, row: TryOnCreationRow): Promise<string>;
  finishRequest(id: string, status: "generated" | "failed", errorCode: string | null): Promise<void>;
  references(): Promise<InlineImage[]>;
  /** Sends the images, in this order, with the system instructions. */
  generate(images: InlineImage[]): Promise<GenerateOutcome>;
  now?: () => Date;
  log(message: string, detail?: unknown): void;
}

export const PHOTO_MAX_BYTES = 6 * 1024 * 1024;
export const DESIGN_MAX_BYTES = 3 * 1024 * 1024;
const BODY_MAX_BYTES = PHOTO_MAX_BYTES + DESIGN_MAX_BYTES + 64 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The reference the browser names, or null when malformed (exactly one kind). */
export function readSourceRef(raw: unknown): TryOnSourceRef | null {
  if (typeof raw !== "string" || raw.length > 400) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const keys = Object.keys(d).sort().join(",");
  if (keys === "creation_id" && typeof d.creation_id === "string" && UUID.test(d.creation_id)) return { creationId: d.creation_id.toLowerCase() };
  if (keys === "token" && typeof d.token === "string" && /^[0-9a-f]{48}$/.test(d.token)) return { token: d.token };
  if (keys === "handle,item_id" && typeof d.handle === "string" && /^[a-z0-9._-]{3,30}$/i.test(d.handle) && typeof d.item_id === "string" && UUID.test(d.item_id)) {
    return { handle: d.handle.toLowerCase(), itemId: d.item_id.toLowerCase() };
  }
  return null;
}

async function inlineFile(value: FormDataEntryValue | null, maxBytes: number): Promise<InlineImage | null | "invalid"> {
  if (value === null) return null;
  if (typeof value === "string" || !IMAGE_TYPES.has(value.type) || value.size === 0 || value.size > maxBytes) return "invalid";
  const bytes = new Uint8Array(await value.arrayBuffer());
  return { mimeType: value.type, data: toBase64(bytes) };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function handleStudioTryOn(req: Request, deps: StudioTryOnDeps): Promise<Response> {
  const cors = corsHeaders(deps.origins, req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("application/json")) {
    const raw = await req.text();
    let body: unknown = null;
    try {
      body = raw.length <= 256 ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    if (!body || (body as Record<string, unknown>).action !== "status") return json({ ok: false, code: "invalid_request" }, 400, cors);
    return json({ available: deps.available }, 200, cors);
  }
  if (!type.startsWith("multipart/form-data")) return json({ ok: false, code: "invalid_request" }, 400, cors);

  // Nothing is read, stored or counted while the provider is not connected.
  if (!deps.available) return json({ ok: false, code: "not_available" }, 503, cors);

  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return json({ ok: false, code: "sign_in_required" }, 401, cors);
  if (Number(req.headers.get("content-length") ?? "0") > BODY_MAX_BYTES) return json({ ok: false, code: "invalid_request" }, 413, cors);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, code: "invalid_request" }, 400, cors);
  }
  const ref = readSourceRef(form.get("source"));
  const photo = await inlineFile(form.get("photo"), PHOTO_MAX_BYTES);
  const design = await inlineFile(form.get("design"), DESIGN_MAX_BYTES);
  if (!ref || !photo || photo === "invalid" || !design || design === "invalid") return json({ ok: false, code: "invalid_request" }, 400, cors);

  let userId: string | null;
  try {
    userId = await deps.userFromToken(token);
  } catch (error) {
    deps.log("token check failed", error instanceof Error ? error.message : error);
    return json({ ok: false, code: "server_error" }, 500, cors);
  }
  if (!userId) return json({ ok: false, code: "session_expired" }, 401, cors);

  let requestId: string;
  let row: TryOnCreationRow | null;
  try {
    row = await deps.loadCreation(userId, ref);
    if (!row) return json({ ok: false, code: "not_found" }, 404, cors);
    if (!row.allowed) return json({ ok: false, code: "not_allowed" }, 403, cors);
    const now = deps.now?.() ?? new Date();
    const used = await deps.countRecent(userId, new Date(now.getTime() - 24 * 3600 * 1000));
    if (used >= deps.dailyLimit) return json({ ok: false, code: "daily_limit" }, 429, cors);
    requestId = await deps.startRequest(userId, row);
  } catch (error) {
    deps.log("preparing the request failed", error instanceof Error ? error.message : error);
    return json({ ok: false, code: "server_error" }, 500, cors);
  }

  const pieces = piecesFromScene(row.scene);
  if (pieces.length === 0) {
    await deps.finishRequest(requestId, "failed", "empty_creation").catch(() => {});
    return json({ ok: false, code: "not_found" }, 404, cors);
  }

  let outcome: GenerateOutcome;
  try {
    const references = await deps.references().catch((error) => {
      deps.log("reference pictures unavailable", error instanceof Error ? error.message : error);
      return [] as InlineImage[];
    });
    outcome = await deps.generate([design, photo, ...references]);
  } catch (error) {
    outcome = { ok: false, code: "failed", detail: error instanceof Error ? error.message : String(error) };
  }

  if (!outcome.ok) {
    deps.log(`generation ${outcome.code}`, outcome.detail);
    await deps.finishRequest(requestId, "failed", outcome.code).catch(() => {});
    return json({ ok: false, code: outcome.code }, 502, cors);
  }
  await deps.finishRequest(requestId, "generated", null).catch((error) => deps.log("could not close the request", error));
  return json({ ok: true, image: { mime_type: outcome.image.mimeType, data: outcome.image.data } }, 200, cors);
}
