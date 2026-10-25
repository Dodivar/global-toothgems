/**
 * The call to Google's image model ("Nano Banana 2", decision 111).
 *
 * NOT VERIFIED AGAINST THE PROVIDER YET: no key was configured when this was
 * written. Connecting it = setting the function secrets
 *   GEMINI_API_KEY        the Google AI Studio / Gemini API key
 *   GEMINI_IMAGE_MODEL    the model id, as Google's documentation names it
 *   GEMINI_API_BASE       optional, defaults to the public Gemini API
 * Until both of the first two are set, the function answers `not_available`.
 *
 * Request: `models/<model>:generateContent` with the system instructions in
 * `systemInstruction` and one user turn holding the images, inline (base64),
 * in the order the instructions name them, then the design data when the
 * prompt version reads it (v2). Response: the first
 * inline image part of the first candidate.
 */

export interface InlineImage {
  mimeType: string;
  /** Base64, no `data:` prefix. */
  data: string;
}

export interface ImageModelConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export type GenerateOutcome =
  | { ok: true; image: InlineImage }
  /** `blocked`: the provider refused the content (safety); `failed`: anything else. */
  | { ok: false; code: "blocked" | "failed"; detail?: string };

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** The configuration, or null while the owner has not connected the provider. */
export function imageModelConfig(env: (name: string) => string | undefined): ImageModelConfig | null {
  const apiKey = env("GEMINI_API_KEY")?.trim();
  const model = env("GEMINI_IMAGE_MODEL")?.trim();
  if (!apiKey || !model || !/^[\w.-]{3,80}$/.test(model)) return null;
  const base = (env("GEMINI_API_BASE")?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
  return { apiKey, model, baseUrl: base };
}

export async function generateImage(
  config: ImageModelConfig,
  systemPrompt: string,
  images: InlineImage[],
  /** Text sent after the images (the design data), or null for images only. */
  text: string | null,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 90_000,
): Promise<GenerateOutcome> {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [
          ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } })),
          ...(text ? [{ text }] : []),
        ],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  let res: Response;
  try {
    res = await fetchImpl(`${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { ok: false, code: "failed", detail: error instanceof Error ? error.message : "network" };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, code: "failed", detail: `http ${res.status} ${text.slice(0, 300)}` };
  }
  return readImage(await res.json().catch(() => null));
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
