import { corsHeaders, json, type SiteOrigins } from "../_shared/http.ts";
import { bearer, looksLikeJwt } from "../_shared/studioBilling.ts";
import { nearestAspectRatio, type GenerateOutcome, type InlineImage } from "./gemini.ts";
import { cropJpeg, mouthCrop, type CropRect } from "./crop.ts";
import { imageSize, judgePhoto, photoScale } from "./photoCheck.ts";
import { buildDesignData, piecesFromScene, readSeats } from "./prompt.ts";

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
 *     design  the browser's 3D render of the creation (≤ 3 MB): IMAGE 1 of
 *             the system instructions (`systemPrompt.ts`), the photo IMAGE 2
 *     map     optional PNG (≤ 2 MB): the flat design map drawn by the browser
 *             (`webapp/src/lib/studio3d/tryOnMap.ts`), IMAGE 3 with prompt v3,
 *             each gem tagged like its design data line; ignored with v1
 *     overview  optional JPEG (≤ 3 MB): the same 3D design seen from further
 *             away, the whole smile around the gems (`designImage.ts`),
 *             IMAGE 4 — sent to the model only with the map (v3)
 *     seats   optional JSON: each gem's place and size on its tooth, measured
 *             by the browser (`prompt.ts` `readSeats`), matched to the stored
 *             gems by id
 *     progress  optional "1": the answer is an event stream instead (see
 *             `progressStream`), so the browser shows the photo check as a step
 *     200 { ok: true, image: { mime_type, data }, crop? }   base64, never stored;
 *             crop { x, y, width, height, photo_width, photo_height }: the image
 *             is the edited mouth close-up, to paste back at that place of the photo (`crop.ts`)
 *     422 { ok: false, code: "photo_unsuitable", reasons }  the photo check
 *             (`photoCheck.ts`) refused the photo: too_far | not_frontal | no_teeth |
 *             teeth_hidden | too_dark | too_bright | blurry — no generation
 *   status call (JSON `{ "action": "status" }`, no account needed):
 *     200 { available, daily_limit, quota }  quota: the signed-in caller's
 *             { limit, remaining } renders over the last 24 hours,
 *             { unlimited: true } for an active administrator, null for a visitor
 *     4xx/5xx { ok: false, code }  invalid_request | sign_in_required |
 *             session_expired | not_found | not_allowed | daily_limit |
 *             not_available | blocked | failed | server_error
 *
 * The creation and the owner's plan switch are read from the database
 * (`studio_try_on_creation`), so only a creation the requester may see, and
 * whose owner has the option, is ever rendered; a request is counted before the provider is
 * called (`studio_try_on_requests`, daily limits per account: the renders —
 * photos refused by the check do not count — and every request, checks
 * included; active administrators have none, their requests are still
 * recorded). The photo is checked first by a small text model; a failed
 * check (provider down, no answer) never blocks the render. The photo and
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
  /** Renders per account per 24 h (photos refused by the check not counted). */
  dailyLimit: number;
  /** Requests per account per 24 h, refused photos included. */
  dailyChecks: number;
  userFromToken(token: string): Promise<string | null>;
  loadCreation(requester: string, ref: TryOnSourceRef): Promise<TryOnCreationRow | null>;
  /** Whether the account has no daily limit: an active administrator (owner's decision, 2026-10-26, to test freely). */
  unlimited(userId: string): Promise<boolean>;
  /** The account's requests since then: all of them, and those that were not refused by the photo check. */
  countRecent(userId: string, since: Date): Promise<{ requests: number; renders: number }>;
  startRequest(userId: string, row: TryOnCreationRow): Promise<string>;
  finishRequest(id: string, status: "generated" | "failed", errorCode: string | null): Promise<void>;
  references(): Promise<InlineImage[]>;
  /** Whether the model edits a close-up of the mouth (`crop.ts`) instead of the whole photo. */
  cropMouth: boolean;
  /** Whether the prompt reads the flat design map (IMAGE 3): v3 only; v1 never gets it. */
  readsMap: boolean;
  /** The photo check model's answer (`photoCheck.ts`), or why there is none; absent: no check. */
  checkPhoto?(photo: InlineImage): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; detail: string }>;
  /**
   * Sends the images, in this order, with the system instructions; `designData`
   * (the gems as text, from the database) follows them when the prompt version reads it.
   */
  generate(images: InlineImage[], designData: string, aspectRatio: string | null): Promise<GenerateOutcome>;
  now?: () => Date;
  log(message: string, detail?: unknown): void;
}

export const PHOTO_MAX_BYTES = 6 * 1024 * 1024;
export const DESIGN_MAX_BYTES = 3 * 1024 * 1024;
export const MAP_MAX_BYTES = 2 * 1024 * 1024;
const BODY_MAX_BYTES = PHOTO_MAX_BYTES + 2 * DESIGN_MAX_BYTES + MAP_MAX_BYTES + 64 * 1024;
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

async function inlineFile(
  value: FormDataEntryValue | null,
  maxBytes: number,
): Promise<Photo | null | "invalid"> {
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
  const design = await inlineFile(form.get("design"), DESIGN_MAX_BYTES);
  // The flat map is optional (a site older than the map sends none); a malformed one is dropped, never fatal.
  const mapFile = deps.readsMap ? await inlineFile(form.get("map"), MAP_MAX_BYTES) : null;
  const map = mapFile && mapFile !== "invalid" ? mapFile : null;
  // The overview goes only with the map (it is IMAGE 4); optional and never fatal, like the map.
  const overviewFile = map ? await inlineFile(form.get("overview"), DESIGN_MAX_BYTES) : null;
  const overview = overviewFile && overviewFile !== "invalid" ? overviewFile : null;
  const seats = readSeats(form.get("seats"));
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
    if (!(await deps.unlimited(userId)) && (await remainingRenders(deps, userId)) === 0) return json({ ok: false, code: "daily_limit" }, 429, cors);
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

  const run = (onRendering: () => void) => checkAndRender(deps, requestId, photo, design, map, overview, pieces, seats, onRendering);
  if (form.get("progress") !== "1") {
    const ending = await run(() => {});
    return json(ending.body, ending.status, cors);
  }
  return progressStream(run, cors);
}

/** Renders the account may still ask for in the last 24 hours: none once either daily cap is reached. */
async function remainingRenders(deps: StudioTryOnDeps, userId: string): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const used = await deps.countRecent(userId, new Date(now.getTime() - 24 * 3600 * 1000));
  return used.requests >= deps.dailyChecks ? 0 : Math.max(0, deps.dailyLimit - used.renders);
}

/**
 * The signed-in caller's daily allowance, for the status call: `{ limit,
 * remaining }`, `{ unlimited: true }` for an active administrator, or null
 * without a valid member token (a visitor) or when it cannot be read — the
 * status itself never fails on it. Display only: a generation counts again.
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

type Ending = { status: number; body: Record<string, unknown> };
type Photo = InlineImage & { bytes: Uint8Array; size: { width: number; height: number } | null };

/**
 * The browser asked to follow the request (`progress=1`): an event stream
 * (`text/event-stream`, always 200) of `{ "stage": "checking" }`, then
 * `{ "stage": "rendering" }` once the photo passed the check (or the check
 * could not run), then `{ "result": <the usual body> }`. The dialog shows
 * the check as its own step from these events. A browser that leaves mid-way
 * does not stop the request: it is still closed in `studio_try_on_requests`.
 */
function progressStream(run: (onRendering: () => void) => Promise<Ending>, cors: Record<string, string>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false; // the browser left: the request still runs to its end
        }
      };
      send({ stage: "checking" });
      void run(() => send({ stage: "rendering" }))
        .catch((): Ending => ({ status: 500, body: { ok: false, code: "server_error" } }))
        .then((ending) => {
          send({ result: ending.body });
          if (open) controller.close();
        });
    },
  });
  return new Response(body, {
    status: 200,
    headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** The photo check, then the render; the request is closed whatever happens. */
async function checkAndRender(
  deps: StudioTryOnDeps,
  requestId: string,
  photo: Photo,
  design: Photo,
  map: Photo | null,
  overview: Photo | null,
  pieces: ReturnType<typeof piecesFromScene>,
  seats: ReturnType<typeof readSeats>,
  onRendering: () => void,
): Promise<Ending> {
  let mmShare: number | null = null;
  let teethBox: unknown = null;
  if (deps.checkPhoto) {
    const answer = await deps.checkPhoto({ mimeType: photo.mimeType, data: photo.data }).catch((error) => ({
      ok: false as const,
      detail: error instanceof Error ? error.message : String(error),
    }));
    if (answer.ok) {
      const verdict = judgePhoto(answer.value, photo.size);
      mmShare = photoScale(answer.value, photo.size);
      teethBox = answer.value.teeth_box;
      // Facts only, never the photo: they tune the thresholds.
      deps.log("photo check", {
        span: verdict.span,
        issues: verdict.issues,
        lighting: answer.value.lighting,
        sharpness: answer.value.sharpness,
        pose: answer.value.head_pose,
        centrals: answer.value.central_incisors_visible,
        mm: mmShare === null ? null : Math.round(mmShare * 10000) / 10000,
      });
      if (verdict.issues.length > 0) {
        await deps.finishRequest(requestId, "failed", "photo_unsuitable").catch(() => {});
        return { status: 422, body: { ok: false, code: "photo_unsuitable", reasons: verdict.issues } };
      }
    } else {
      deps.log("photo check unavailable, rendering anyway", answer.detail);
    }
  }

  onRendering();

  // The mouth close-up: the model edits the teeth and lips only, the browser pastes them back (`crop.ts`).
  const edited = deps.cropMouth ? closeUp(photo, teethBox) : null;
  if (deps.cropMouth) {
    deps.log("mouth crop", edited ? { photo: photo.size, crop: edited.crop } : { photo: photo.size, crop: null });
  }
  const target = edited?.image ?? photo;
  // One millimetre as a share of the edited image's width: the crop is narrower than the photo.
  const scale = mmShare !== null && edited && photo.size ? (mmShare * photo.size.width) / edited.crop.width : mmShare;

  // Counts only: whether the browser sent the gems' places (a site older than the seats sends none).
  deps.log("design data", { gems: pieces.length, seats: seats.size, map: map !== null, overview: overview !== null });
  const aspectRatio = nearestAspectRatio(target.size);

  let outcome: GenerateOutcome;
  try {
    const references = await deps.references().catch((error) => {
      deps.log("reference pictures unavailable", error instanceof Error ? error.message : error);
      return [] as InlineImage[];
    });
    const images = [{ mimeType: design.mimeType, data: design.data }, { mimeType: target.mimeType, data: target.data }];
    if (map) images.push({ mimeType: map.mimeType, data: map.data });
    if (map && overview) images.push({ mimeType: overview.mimeType, data: overview.data });
    outcome = await deps.generate(
      [...images, ...references],
      buildDesignData(pieces, seats, scale, map !== null, edited !== null, overview !== null),
      aspectRatio,
    );
  } catch (error) {
    outcome = { ok: false, code: "failed", detail: error instanceof Error ? error.message : String(error) };
  }

  if (!outcome.ok) {
    deps.log(`generation ${outcome.code}`, outcome.detail);
    await deps.finishRequest(requestId, "failed", outcome.code).catch(() => {});
    return { status: 502, body: { ok: false, code: outcome.code } };
  }
  await deps.finishRequest(requestId, "generated", null).catch((error) => deps.log("could not close the request", error));
  // Sizes only: what was sent against what came back, to see the model change the proportions.
  deps.log("render size", {
    sent: target.size,
    asked: aspectRatio,
    received: headerSize(outcome.image.data),
    ratio_dropped: outcome.aspectRatioDropped === true,
  });
  const image = { mime_type: outcome.image.mimeType, data: outcome.image.data };
  if (!edited || !photo.size) return { status: 200, body: { ok: true, image } };
  const { crop } = edited;
  return {
    status: 200,
    body: { ok: true, image, crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height, photo_width: photo.size.width, photo_height: photo.size.height } },
  };
}

/** The photo's mouth close-up, or null to edit the whole photo (no box, not a JPEG, no useful crop, decoding failed). */
function closeUp(photo: Photo, teethBox: unknown): { image: Photo; crop: CropRect } | null {
  if (photo.mimeType !== "image/jpeg") return null;
  const crop = mouthCrop(teethBox, photo.size);
  if (!crop) return null;
  const bytes = cropJpeg(photo.bytes, crop);
  if (!bytes) return null;
  return { image: { mimeType: "image/jpeg", data: toBase64(bytes), bytes, size: { width: crop.width, height: crop.height } }, crop };
}
