/**
 * The call to Google's image model ("Nano Banana", decision 111), through one
 * of two doors, chosen by the function secrets:
 *
 *   Vertex AI with Application Default Credentials (the owner's Google policy
 *   forbids API keys, 2026-10-25):
 *     GOOGLE_ADC_JSON         the content of the ADC file written by
 *                             `gcloud auth application-default login`
 *                             (type "authorized_user": client id / secret +
 *                             refresh token). The function trades it for a
 *                             short-lived access token (cached until it
 *                             expires) — the file itself never leaves Supabase.
 *     GOOGLE_CLOUD_PROJECT    optional, else the file's `quota_project_id`
 *     GOOGLE_CLOUD_LOCATION   optional, `global` by default
 *   or the Gemini API with a key:
 *     GEMINI_API_KEY          (+ GEMINI_API_BASE, optional)
 *   and in both cases
 *     GEMINI_IMAGE_MODEL      the model id, as Google's documentation names it.
 * Vertex wins when both are set. Without a door, the function answers
 * `not_available`.
 *
 * NOT VERIFIED AGAINST THE PROVIDER YET. Request: `…/models/<model>:generateContent`
 * with the system instructions in `systemInstruction` and one user turn
 * holding the images, inline (base64), in the order the instructions name
 * them, then the design data when the prompt version reads it (v2).
 * Response: the first inline image part of the first candidate.
 */

export interface InlineImage {
  mimeType: string;
  /** Base64, no `data:` prefix. */
  data: string;
}

/** Fields of an "authorized_user" ADC file. */
export interface AdcUserCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type ImageModelConfig =
  | { kind: "api_key"; model: string; apiKey: string; baseUrl: string }
  | { kind: "vertex"; model: string; credentials: AdcUserCredentials; project: string; location: string };

export type GenerateOutcome =
  | { ok: true; image: InlineImage }
  /** `blocked`: the provider refused the content (safety); `failed`: anything else. */
  | { ok: false; code: "blocked" | "failed"; detail?: string };

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ID = /^[\w.-]{3,80}$/;

/** The "authorized_user" ADC file's credentials and quota project, or null when it is not one. */
export function readAdcJson(raw: string | undefined): { credentials: AdcUserCredentials; quotaProject: string | null } | null {
  if (!raw?.trim()) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (d.type !== "authorized_user") return null;
  const { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken } = d;
  if (typeof clientId !== "string" || typeof clientSecret !== "string" || typeof refreshToken !== "string") return null;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const quota = typeof d.quota_project_id === "string" && ID.test(d.quota_project_id) ? d.quota_project_id : null;
  return { credentials: { clientId, clientSecret, refreshToken }, quotaProject: quota };
}

/** The configuration, or null while the owner has not connected the provider. */
export function imageModelConfig(env: (name: string) => string | undefined): ImageModelConfig | null {
  const model = env("GEMINI_IMAGE_MODEL")?.trim();
  if (!model || !ID.test(model)) return null;
  const adc = readAdcJson(env("GOOGLE_ADC_JSON"));
  if (adc) {
    const project = env("GOOGLE_CLOUD_PROJECT")?.trim() || adc.quotaProject;
    const location = env("GOOGLE_CLOUD_LOCATION")?.trim() || "global";
    if (project && ID.test(project) && /^[a-z0-9-]{2,40}$/.test(location)) {
      return { kind: "vertex", model, credentials: adc.credentials, project, location };
    }
  }
  const apiKey = env("GEMINI_API_KEY")?.trim();
  if (!apiKey) return null;
  const baseUrl = (env("GEMINI_API_BASE")?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
  return { kind: "api_key", model, apiKey, baseUrl };
}

/**
 * Why `imageModelConfig` found no door, in words safe for the logs: it names
 * the secret and what is wrong with its shape, never its value.
 */
export function configProblem(env: (name: string) => string | undefined): string | null {
  if (imageModelConfig(env)) return null;
  const problems: string[] = [];
  const model = env("GEMINI_IMAGE_MODEL")?.trim();
  if (!model) problems.push("GEMINI_IMAGE_MODEL is missing");
  else if (!ID.test(model)) problems.push(`GEMINI_IMAGE_MODEL must be a bare model id (letters, digits, . _ -; ${model.length} chars given${model.includes("/") ? ", contains '/'" : ""}${/\s/.test(model) ? ", contains spaces" : ""})`);
  const raw = env("GOOGLE_ADC_JSON");
  if (raw?.trim()) {
    let type: unknown = "not JSON";
    try {
      const parsed = JSON.parse(raw);
      type = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).type ?? "no type field" : typeof parsed;
    } catch {
      const t = raw.trim();
      type = `not JSON (starts with ${JSON.stringify(t.slice(0, 1))}, ${t.length} chars)`;
    }
    const adc = readAdcJson(raw);
    if (!adc) problems.push(`GOOGLE_ADC_JSON is not an authorized_user ADC file (type: ${String(type).slice(0, 80)})`);
    else if (!(env("GOOGLE_CLOUD_PROJECT")?.trim() || adc.quotaProject)) problems.push("no Google Cloud project: set GOOGLE_CLOUD_PROJECT");
  } else if (!env("GEMINI_API_KEY")?.trim()) problems.push("neither GOOGLE_ADC_JSON nor GEMINI_API_KEY is set");
  return problems.join("; ") || "unknown";
}

/** Where the request goes: the global Vertex endpoint has no region in its host. */
export function generateUrl(config: ImageModelConfig): string {
  const model = encodeURIComponent(config.model);
  if (config.kind === "api_key") return `${config.baseUrl}/models/${model}:generateContent`;
  const host = config.location === "global" ? "aiplatform.googleapis.com" : `${config.location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${config.project}/locations/${config.location}/publishers/google/models/${model}:generateContent`;
}

let cachedToken: { value: string; expiresAt: number; refreshToken: string } | null = null;

/** A Google access token for the ADC user, refreshed a minute before it expires. */
export async function accessToken(credentials: AdcUserCredentials, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.refreshToken === credentials.refreshToken && now < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !data || typeof data.access_token !== "string") {
    // `invalid_grant`: the refresh token was revoked or expired — run `gcloud auth application-default login` again.
    throw new Error(`token refresh failed (${res.status} ${typeof data?.error === "string" ? data.error : ""})`);
  }
  const ttl = typeof data.expires_in === "number" ? data.expires_in : 3600;
  cachedToken = { value: data.access_token, expiresAt: now + ttl * 1000, refreshToken: credentials.refreshToken };
  return data.access_token;
}

/** Forget the cached token (tests). */
export function resetTokenCache() {
  cachedToken = null;
}

async function authHeaders(config: ImageModelConfig, fetchImpl: typeof fetch): Promise<Record<string, string>> {
  if (config.kind === "api_key") return { "x-goog-api-key": config.apiKey };
  // With user credentials, Google bills and counts quota on the project named here.
  return { authorization: `Bearer ${await accessToken(config.credentials, fetchImpl)}`, "x-goog-user-project": config.project };
}

/** POST a `generateContent` body to the model named in `config`: the response, or why it could not be sent. */
async function callModel(config: ImageModelConfig, body: unknown, fetchImpl: typeof fetch, timeoutMs: number): Promise<Response | { error: string }> {
  try {
    const auth = await authHeaders(config, fetchImpl);
    return await fetchImpl(generateUrl(config), {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "network" };
  }
}

/** The output proportions the image models accept (`imageConfig.aspectRatio`). */
export const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;

/**
 * The accepted proportions closest to a photo's: asked for so the model keeps
 * the photo's framing instead of recomposing it (a format, not a resolution:
 * the price does not change). Null when the size is unknown.
 */
export function nearestAspectRatio(size: { width: number; height: number } | null): string | null {
  if (!size || !(size.width > 0) || !(size.height > 0)) return null;
  const target = Math.log(size.width / size.height);
  let best: string = ASPECT_RATIOS[0];
  let gap = Infinity;
  for (const ratio of ASPECT_RATIOS) {
    const [w, h] = ratio.split(":").map(Number);
    const d = Math.abs(Math.log(w / h) - target);
    if (d < gap) {
      gap = d;
      best = ratio;
    }
  }
  return best;
}

export async function generateImage(
  config: ImageModelConfig,
  systemPrompt: string,
  images: InlineImage[],
  /** Text sent after the images (the design data), or null for images only. */
  text: string | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 90_000,
  /** The output proportions (`nearestAspectRatio`); a model that refuses the option is asked again without it. */
  aspectRatio: string | null = null,
): Promise<GenerateOutcome> {
  const body = (withRatio: boolean) => ({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })), ...(text ? [{ text }] : [])],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE"], ...(withRatio && aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
  });
  let res = await callModel(config, body(true), fetchImpl, timeoutMs);
  if (aspectRatio && res instanceof Response && res.status === 400) {
    await res.body?.cancel();
    res = await callModel(config, body(false), fetchImpl, timeoutMs);
  }
  if (!(res instanceof Response)) return { ok: false, code: "failed", detail: res.error };
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, code: "failed", detail: `http ${res.status} ${detail.slice(0, 300)}` };
  }
  return readImage(await res.json().catch(() => null));
}

/**
 * A text model's structured answer about images (the photo check,
 * `photoCheck.ts`): the JSON object of the first candidate, or an error
 * detail. The model is `config.model` — pass the check model's config.
 */
export async function generateJson(
  config: ImageModelConfig,
  systemPrompt: string,
  images: InlineImage[],
  responseSchema: unknown,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; detail: string }> {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })) }],
    generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0 },
  };
  const res = await callModel(config, body, fetchImpl, timeoutMs);
  if (!(res instanceof Response)) return { ok: false, detail: res.error };
  if (!res.ok) return { ok: false, detail: `http ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}` };
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const candidate = (Array.isArray(json?.candidates) ? json.candidates[0] : null) as Record<string, unknown> | null;
  const parts = ((candidate?.content as Record<string, unknown> | undefined)?.parts ?? []) as unknown[];
  const text = (Array.isArray(parts) ? parts : [])
    .map((p) => (p && typeof p === "object" && typeof (p as Record<string, unknown>).text === "string" ? (p as Record<string, string>).text : ""))
    .join("");
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return { ok: true, value };
  } catch {
    /* below */
  }
  return { ok: false, detail: `no JSON in the answer (${String(candidate?.finishReason ?? (json?.promptFeedback ? "blocked" : "empty"))})` };
}

/** The first inline image of the answer; a safety block or an answer without image is not one. */
export function readImage(json: unknown): GenerateOutcome {
  const data = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const feedback = data.promptFeedback as Record<string, unknown> | undefined;
  if (feedback && typeof feedback.blockReason === "string") return { ok: false, code: "blocked", detail: feedback.blockReason };
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  for (const c of candidates) {
    const cand = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const parts = ((cand.content as Record<string, unknown> | undefined)?.parts ?? []) as unknown[];
    for (const part of Array.isArray(parts) ? parts : []) {
      const p = (part && typeof part === "object" ? part : {}) as Record<string, unknown>;
      const inline = (p.inlineData ?? p.inline_data) as Record<string, unknown> | undefined;
      const mime = inline?.mimeType ?? inline?.mime_type;
      if (inline && typeof inline.data === "string" && typeof mime === "string" && /^image\/(png|jpeg|webp)$/.test(mime)) {
        return { ok: true, image: { mimeType: mime, data: inline.data } };
      }
    }
    if (cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT" || cand.finishReason === "IMAGE_SAFETY") {
      return { ok: false, code: "blocked", detail: String(cand.finishReason) };
    }
  }
  return { ok: false, code: "failed", detail: "no image in the answer" };
}
