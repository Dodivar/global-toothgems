import { corsHeaders, json, type SiteOrigins } from "../_shared/http.ts";
import { bearer, looksLikeJwt } from "../_shared/studioBilling.ts";
import { nearestAspectRatio, type GenerateOutcome, type InlineImage } from "./gemini.ts";
import { cropJpeg, mouthCrop, type CropRect } from "./crop.ts";
import { imageSize, judgeReadings, PHOTO_READINGS } from "./photoCheck.ts";
import { readTeeth } from "./teeth.ts";

/**
 * POST /functions/v1/studio-try-on   (decision 111, computed placement since 2026-11-01: decision 111 (k))
 *
 * A try-on is two calls from the browser. The gems' places are computed in
 * the browser from the teeth found on the photo; the image model only makes
 * the placed gems look real.
 *
 *   { "action": "status" }  (JSON, no account needed)
 *     200 { available, daily_limit, quota }   whether the AI is connected — the
 *             browser asks before any photo leaves the device; quota: the
 *             signed-in caller's { limit, remaining } renders over the last
 *             24 hours, { unlimited: true } for an active administrator, null
 *             for a visitor
 *
 *   1. multipart/form-data, `action` = "analyse"  (the member's token)
 *     source  JSON: { "creation_id" } (one's own creation) | { "token" } (share
 *             link) | { "handle", "item_id" } (approved Glowbook creation)
 *     photo   the smile photo (JPEG / PNG / WebP, ≤ 6 MB), prepared in the browser
 *     The photo check (`photoCheck.ts`), the mouth close-up (`crop.ts`), then
 *     each tooth on it with its FDI number (`teeth.ts`). No image generated.
 *     200 { ok: true, crop: { x, y, width, height, photo_width, photo_height },
 *           teeth: [{ fdi, x, y, width, height }] }   boxes in the close-up's pixels
 *     422 { ok: false, code: "photo_unsuitable", reasons }  too_far | not_frontal |
 *             no_teeth | teeth_hidden | too_dark | too_bright | blurry
 *     Recorded as failed / `analysis`: counted against the daily requests
 *     (TRY_ON_DAILY_CHECKS), never against the renders.
 *
 *   2. multipart/form-data, the render  (the member's token)
 *     source, photo  as above (the photo a JPEG)
 *     design  the browser's 3D render of the creation (≤ 3 MB): cut, colour, rotation
 *     guide   JPEG (≤ 3 MB): the close-up with every gem drawn as a flat mark where
 *             the browser placed it (`webapp/src/lib/studio3d/tryOnRegistration.ts`)
 *     crop    JSON { x, y, width, height }: where that close-up was cut (the analysis's crop)
 *     marks   how many marks the guide holds (1–200)
 *     The model turns the marks into real gems (`TRY_ON_SYSTEM_PROMPT`): IMAGE 1
 *     the guide, IMAGE 2 the same close-up cut here from the photo, IMAGE 3 the
 *     design, then the owner's reference pictures. Counted as a render.
 *     200 { ok: true, image: { mime_type, data }, crop }   base64, never stored
 *
 *   Errors: 4xx/5xx { ok: false, code }  invalid_request | sign_in_required |
 *     session_expired | not_found | not_allowed | daily_limit | not_available |
 *     blocked | failed | server_error
 *
 * The creation and the owner's plan switch are read from the database
 * (`studio_try_on_creation`), so only a creation the requester may see, and
 * whose owner has the option, is ever analysed or rendered. Every request is
 * recorded (`studio_try_on_requests`) before a provider is called; active
 * administrators have no daily limit. The photo and the image only pass
 * through memory.
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
  /** Renders per account per 24 h. */
  dailyLimit: number;
  /** Requests per account per 24 h, analyses and refused photos included. */
  dailyChecks: number;
  userFromToken(token: string): Promise<string | null>;
  loadCreation(requester: string, ref: TryOnSourceRef): Promise<TryOnCreationRow | null>;
  /** Whether the account has no daily limit: an active administrator (owner's decision, 2026-10-26, to test freely). */
  unlimited(userId: string): Promise<boolean>;
  /** The account's requests since then: all of them, and the renders among them. */
  countRecent(userId: string, since: Date): Promise<{ requests: number; renders: number }>;
  startRequest(userId: string, row: TryOnCreationRow): Promise<string>;
  finishRequest(id: string, status: "generated" | "failed", errorCode: string | null): Promise<void>;
  references(): Promise<InlineImage[]>;
  /**
   * One reading of the photo by the check model (`photoCheck.ts`), or why there is none; absent: no check.
   * Called `PHOTO_READINGS` times at once; `reading` tells them apart (0 the first).
   */
  checkPhoto?(photo: InlineImage, reading: number): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; detail: string }>;
  /** Each tooth on the close-up, by the teeth model (`teeth.ts`). */
  findTeeth(image: InlineImage): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; detail: string }>;
  /** Sends the images, in this order, with the system instructions and the text after them. */
  generate(images: InlineImage[], text: string, aspectRatio: string | null): Promise<GenerateOutcome>;
  now?: () => Date;
  log(message: string, detail?: unknown): void;
}

export const PHOTO_MAX_BYTES = 6 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const BODY_MAX_BYTES = PHOTO_MAX_BYTES + 2 * IMAGE_MAX_BYTES + 64 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Error codes of requests that produced no image: they never count as renders. */
export const NOT_RENDERED_CODES = ["photo_unsuitable", "analysis", "diagnostic"];

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

type Photo = InlineImage & { bytes: Uint8Array; size: { width: number; height: number } | null };
type Ending = { status: number; body: Record<string, unknown> };

async function inlineFile(value: FormDataEntryValue | null, maxBytes: number): Promise<Photo | null | "invalid"> {
  if (value === null) return null;
  if (typeof value === "string" || !IMAGE_TYPES.has(value.type) || value.size === 0 || value.size > maxBytes) return "invalid";
  const bytes = new Uint8Array(await value.arrayBuffer());
  return { mimeType: value.type, data: toBase64(bytes), bytes, size: imageSize(bytes) };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** An image's size from the start of its base64 (its header), or null when it cannot be read there. */
export function headerSize(base64: string): { width: number; height: number } | null {
  try {
    const binary = atob(base64.slice(0, 64 * 1024));
    return imageSize(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** The browser's crop of the photo (`{ x, y, width, height }`, whole pixels inside it), or null. */
export function readCropRect(raw: FormDataEntryValue | null, size: { width: number; height: number } | null): CropRect | null {
  if (typeof raw !== "string" || raw.length > 200 || !size) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { x, y, width, height } = data as Record<string, unknown>;
  const ints = [x, y, width, height];
  if (!ints.every((n) => typeof n === "number" && Number.isInteger(n))) return null;
  const [cx, cy, cw, ch] = ints as number[];
  if (cx < 0 || cy < 0 || cw < 64 || ch < 64 || cx + cw > size.width || cy + ch > size.height) return null;
  return { x: cx, y: cy, width: cw, height: ch };
}

/** Whether a stored scene holds at least one piece. */
function hasPieces(scene: unknown): boolean {
  const pieces = scene && typeof scene === "object" ? (scene as Record<string, unknown>).pieces : null;
  return Array.isArray(pieces) && pieces.length > 0;
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
    return json({ available: deps.available, daily_limit: deps.dailyLimit, quota: await quotaFor(req, deps) }, 200, cors);
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
  if (!ref || !photo || photo === "invalid") return json({ ok: false, code: "invalid_request" }, 400, cors);

  const analyse = form.get("action") === "analyse";
  let render: { design: Photo; guide: Photo; rect: CropRect; marks: number } | null = null;
  if (!analyse) {
    const design = await inlineFile(form.get("design"), IMAGE_MAX_BYTES);
    const guide = await inlineFile(form.get("guide"), IMAGE_MAX_BYTES);
    const rect = readCropRect(form.get("crop"), photo.size);
    const marks = Number(form.get("marks"));
    if (
      !design || design === "invalid" || !guide || guide === "invalid" || guide.mimeType !== "image/jpeg" ||
      photo.mimeType !== "image/jpeg" || !rect || !Number.isInteger(marks) || marks < 1 || marks > 200
    ) {
      return json({ ok: false, code: "invalid_request" }, 400, cors);
    }
    render = { design, guide, rect, marks };
  }

  let userId: string | null;
  try {
    userId = await deps.userFromToken(token);
  } catch (error) {
    deps.log("token check failed", error instanceof Error ? error.message : error);
    return json({ ok: false, code: "server_error" }, 500, cors);
  }
  if (!userId) return json({ ok: false, code: "session_expired" }, 401, cors);

  let requestId: string;
  try {
    const row = await deps.loadCreation(userId, ref);
    if (!row) return json({ ok: false, code: "not_found" }, 404, cors);
    if (!row.allowed) return json({ ok: false, code: "not_allowed" }, 403, cors);
    if (!hasPieces(row.scene)) return json({ ok: false, code: "not_found" }, 404, cors);
    if (!(await deps.unlimited(userId)) && (await (analyse ? remainingChecks : remainingRenders)(deps, userId)) === 0) {
      return json({ ok: false, code: "daily_limit" }, 429, cors);
    }
    requestId = await deps.startRequest(userId, row);
  } catch (error) {
    deps.log("preparing the request failed", error instanceof Error ? error.message : error);
    return json({ ok: false, code: "server_error" }, 500, cors);
  }

  const ending = await (render ? renderPlaced(deps, requestId, photo, render) : analysePhoto(deps, requestId, photo)).catch((error): Ending => {
    deps.log(render ? "render failed" : "analysis failed", error instanceof Error ? error.message : error);
    deps.finishRequest(requestId, "failed", "server_error").catch(() => {});
    return { status: 500, body: { ok: false, code: "server_error" } };
  });
  return json(ending.body, ending.status, cors);
}

const since24h = (deps: StudioTryOnDeps) => new Date((deps.now?.() ?? new Date()).getTime() - 24 * 3600 * 1000);

/** Renders the account may still ask for in the last 24 hours: none once either daily cap is reached. */
async function remainingRenders(deps: StudioTryOnDeps, userId: string): Promise<number> {
  const used = await deps.countRecent(userId, since24h(deps));
  return used.requests >= deps.dailyChecks ? 0 : Math.max(0, deps.dailyLimit - used.renders);
}

/** Requests the account may still make in the last 24 hours, refused photos and analyses included. */
async function remainingChecks(deps: StudioTryOnDeps, userId: string): Promise<number> {
  const used = await deps.countRecent(userId, since24h(deps));
  return Math.max(0, deps.dailyChecks - used.requests);
}

/**
 * The signed-in caller's daily allowance, for the status call: `{ limit,
 * remaining }`, `{ unlimited: true }` for an active administrator, or null
 * without a valid member token (a visitor) or when it cannot be read — the
 * status itself never fails on it. Display only: a render counts again.
 */
async function quotaFor(req: Request, deps: StudioTryOnDeps): Promise<Record<string, unknown> | null> {
  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return null;
  try {
    const userId = await deps.userFromToken(token);
    if (!userId) return null;
    if (await deps.unlimited(userId)) return { unlimited: true };
    return { limit: deps.dailyLimit, remaining: await remainingRenders(deps, userId) };
  } catch (error) {
    deps.log("reading the daily allowance failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * The photo check (several readings, the strictest kept): the refusal to send,
 * or the teeth's box read from the photo (null when the check could not run —
 * a failed check never blocks).
 */
async function checkPhoto(deps: StudioTryOnDeps, requestId: string, photo: Photo): Promise<{ refused: Ending } | { teethBox: unknown }> {
  if (!deps.checkPhoto) return { teethBox: null };
  const readings = await Promise.all(
    Array.from({ length: PHOTO_READINGS }, (_, i) =>
      deps.checkPhoto!({ mimeType: photo.mimeType, data: photo.data }, i).catch((error) => ({
        ok: false as const,
        detail: error instanceof Error ? error.message : String(error),
      })),
    ),
  );
  const answers = readings.flatMap((r) => (r.ok ? [r.value] : []));
  if (answers.length === 0) {
    deps.log("photo check unavailable, analysing anyway", readings.map((r) => (r.ok ? "ok" : r.detail)));
    return { teethBox: null };
  }
  const { verdict, reading, spans } = judgeReadings(answers, photo.size);
  // Facts only, never the photo: they tune the thresholds.
  deps.log("photo check", {
    span: verdict.span,
    spans,
    issues: verdict.issues,
    lighting: answers.map((a) => a.lighting),
    sharpness: answers.map((a) => a.sharpness),
    pose: answers.map((a) => a.head_pose),
    centrals: answers.map((a) => a.central_incisors_visible),
  });
  if (verdict.issues.length > 0) {
    await deps.finishRequest(requestId, "failed", "photo_unsuitable").catch(() => {});
    return { refused: { status: 422, body: { ok: false, code: "photo_unsuitable", reasons: verdict.issues } } };
  }
  return { teethBox: reading.teeth_box };
}

/** Step 1: the photo check, the mouth close-up, then each tooth on it. Nothing is generated. */
async function analysePhoto(deps: StudioTryOnDeps, requestId: string, photo: Photo): Promise<Ending> {
  const checked = await checkPhoto(deps, requestId, photo);
  if ("refused" in checked) return checked.refused;
  const edited = closeUp(photo, checked.teethBox);
  const target = edited?.image ?? photo;
  const size = target.size;
  const found = size
    ? await deps.findTeeth({ mimeType: target.mimeType, data: target.data }).catch((error) => ({
        ok: false as const,
        detail: error instanceof Error ? error.message : String(error),
      }))
    : ({ ok: false, detail: "image size unknown" } as const);
  await deps.finishRequest(requestId, "failed", "analysis").catch(() => {});
  if (!found.ok || !size) {
    deps.log("teeth detection unavailable", found.ok ? "image size unknown" : found.detail);
    return { status: 502, body: { ok: false, code: "failed" } };
  }
  const teeth = readTeeth(found.value, size);
  // Facts only: which teeth were found, never the photo.
  deps.log("analysis", { crop: edited?.crop ?? null, teeth: teeth.map((t) => t.fdi) });
  const crop = edited?.crop ?? { x: 0, y: 0, width: size.width, height: size.height };
  const photoSize = photo.size ?? size;
  return { status: 200, body: { ok: true, crop: { ...crop, photo_width: photoSize.width, photo_height: photoSize.height }, teeth } };
}

/** Step 2: the model turns the guide's marks into real gems, the untouched close-up beside it. */
async function renderPlaced(
  deps: StudioTryOnDeps,
  requestId: string,
  photo: Photo,
  render: { design: Photo; guide: Photo; rect: CropRect; marks: number },
): Promise<Ending> {
  const { design, guide, rect, marks } = render;
  const original = cropJpeg(photo.bytes, rect);
  if (!original || !photo.size) {
    await deps.finishRequest(requestId, "failed", "crop_failed").catch(() => {});
    return { status: 502, body: { ok: false, code: "failed" } };
  }
  const references = await deps.references().catch((error) => {
    deps.log("reference pictures unavailable", error instanceof Error ? error.message : error);
    return [] as InlineImage[];
  });
  const plural = marks === 1 ? "" : "s";
  const text = [
    "PLACEMENT DATA",
    `IMAGE 1 holds ${marks} gem mark${plural}: your output holds exactly ${marks} gem${plural}, one on each mark, nowhere else.`,
    "IMAGE 2 is the same close-up of the customer's mouth, untouched. IMAGE 3 is the design in 3D (cut, colour, rotation only).",
  ].join("\n");
  deps.log("render", { marks, crop: rect, guide: guide.size });
  const aspectRatio = nearestAspectRatio({ width: rect.width, height: rect.height });
  let outcome: GenerateOutcome;
  try {
    outcome = await deps.generate(
      [
        { mimeType: guide.mimeType, data: guide.data },
        { mimeType: "image/jpeg", data: toBase64(original) },
        { mimeType: design.mimeType, data: design.data },
        ...references,
      ],
      text,
      aspectRatio,
    );
  } catch (error) {
    outcome = { ok: false, code: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
  if (!outcome.ok) {
    deps.log(`render ${outcome.code}`, outcome.detail);
    await deps.finishRequest(requestId, "failed", outcome.code).catch(() => {});
    return { status: 502, body: { ok: false, code: outcome.code } };
  }
  await deps.finishRequest(requestId, "generated", null).catch((error) => deps.log("could not close the request", error));
  // Sizes only: what was sent against what came back, to see the model change the proportions.
  deps.log("render size", { sent: { width: rect.width, height: rect.height }, asked: aspectRatio, received: headerSize(outcome.image.data) });
  return {
    status: 200,
    body: {
      ok: true,
      image: { mime_type: outcome.image.mimeType, data: outcome.image.data },
      crop: { ...rect, photo_width: photo.size.width, photo_height: photo.size.height },
    },
  };
}

/** The photo's mouth close-up, or null to work on the whole photo (no box, not a JPEG, no useful crop, decoding failed). */
function closeUp(photo: Photo, teethBox: unknown): { image: Photo; crop: CropRect } | null {
  if (photo.mimeType !== "image/jpeg") return null;
  const crop = mouthCrop(teethBox, photo.size);
  if (!crop) return null;
  const bytes = cropJpeg(photo.bytes, crop);
  if (!bytes) return null;
  return { image: { mimeType: "image/jpeg", data: toBase64(bytes), bytes, size: { width: crop.width, height: crop.height } }, crop };
}
