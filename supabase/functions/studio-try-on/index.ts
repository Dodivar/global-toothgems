import { requireEnv, serviceClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { configProblem, generateImage, imageModelConfig, type InlineImage } from "./gemini.ts";
import { handleStudioTryOn, toBase64, type TryOnCreationRow } from "./handler.ts";
import { promptVersion, TRY_ON_SYSTEM_PROMPT_V1, TRY_ON_SYSTEM_PROMPT_V3 } from "./systemPrompt.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): the status call is
 * open, and the member's token is checked here for a generation.
 *
 * Secrets: GEMINI_IMAGE_MODEL + GOOGLE_ADC_JSON (Vertex AI) or GEMINI_API_KEY
 * connect the AI (see gemini.ts);
 * TRY_ON_DAILY_LIMIT (optional, default 10) caps generations per account per
 * 24 hours; TRY_ON_PROMPT_VERSION (optional, v3 by default, or v1) picks the
 * system instructions (`systemPrompt.ts`). Reference pictures: the private bucket `studio-try-on-references`
 * (root folder, JPEG / PNG / WebP, the first REFERENCE_MAX by name, at most
 * REFERENCE_MAX_BYTES in all — a picture that would pass it is skipped).
 */

const supabase = serviceClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));
const config = imageModelConfig((name) => Deno.env.get(name));
const limit = Number.parseInt(Deno.env.get("TRY_ON_DAILY_LIMIT") ?? "", 10);
// v3 (default): the revised instructions + the design data; v1: the owner's original, images only.
const version = promptVersion(Deno.env.get("TRY_ON_PROMPT_VERSION"));
const systemPrompt = version === "v1" ? TRY_ON_SYSTEM_PROMPT_V1 : TRY_ON_SYSTEM_PROMPT_V3;
const log = (message: string, detail?: unknown) => console.error(`[studio-try-on] ${message}`, detail ?? "");
// Why the AI is not connected, if it is not: secret names and shapes only, never values.
const problem = configProblem((name) => Deno.env.get(name));
if (problem) log("AI not connected", problem);

const REFERENCE_BUCKET = "studio-try-on-references";
const REFERENCE_MAX = 6;
/** Total raw bytes of reference pictures per request: the photo and the design come on top, all inlined. */
const REFERENCE_MAX_BYTES = 8 * 1024 * 1024;
const REFERENCE_TTL_MS = 10 * 60 * 1000;
let referenceCache: { at: number; images: InlineImage[] } | null = null;

async function references(): Promise<InlineImage[]> {
  if (referenceCache && Date.now() - referenceCache.at < REFERENCE_TTL_MS) return referenceCache.images;
  const { data, error } = await supabase.storage.from(REFERENCE_BUCKET).list("", { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(error.message);
  const files = (data ?? []).filter((f) => f.id && /\.(jpe?g|png|webp)$/i.test(f.name)).slice(0, REFERENCE_MAX);
  const images: InlineImage[] = [];
  let total = 0;
  for (const file of files) {
    const { data: blob, error: err } = await supabase.storage.from(REFERENCE_BUCKET).download(file.name);
    if (err || !blob || total + blob.size > REFERENCE_MAX_BYTES) continue;
    total += blob.size;
    const mimeType = /\.png$/i.test(file.name) ? "image/png" : /\.webp$/i.test(file.name) ? "image/webp" : "image/jpeg";
    images.push({ mimeType, data: toBase64(new Uint8Array(await blob.arrayBuffer())) });
  }
  referenceCache = { at: Date.now(), images };
  return images;
}

Deno.serve((req) =>
  handleStudioTryOn(req, {
    origins,
    available: config !== null,
    dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 10,
    async userFromToken(token) {
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async loadCreation(requester, ref) {
      const { data, error } = await supabase.rpc("studio_try_on_creation", {
        p_requester: requester,
        p_creation_id: "creationId" in ref ? ref.creationId : null,
        p_token: "token" in ref ? ref.token : null,
        p_handle: "handle" in ref ? ref.handle : null,
        p_item_id: "itemId" in ref ? ref.itemId : null,
      });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== "object") return null;
      const row = data as Record<string, unknown>;
      return {
        creationId: String(row.creation_id),
        source: row.source as TryOnCreationRow["source"],
        scene: row.scene_data,
        allowed: row.allowed === true,
      };
    },
    async countRecent(userId, since) {
      const { count, error } = await supabase
        .from("studio_try_on_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async startRequest(userId, row) {
      const { data, error } = await supabase
        .from("studio_try_on_requests")
        .insert({ user_id: userId, creation_id: row.creationId, source: row.source })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    async finishRequest(id, status, errorCode) {
      const { error } = await supabase.from("studio_try_on_requests").update({ status, error_code: errorCode }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    references,
    generate: (images, designData) =>
      config ? generateImage(config, systemPrompt, images, version === "v3" ? designData : null) : Promise.resolve({ ok: false, code: "failed" }),
    log,
  })
);
