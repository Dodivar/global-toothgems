import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import {
  parseTryOnAnalysis,
  parseTryOnResponse,
  parseTryOnStatus,
  sourcePayload,
  UNAVAILABLE_STATUS,
  unavailableTryOnService,
  type SmileTryOnService,
} from "./tryOn";

/**
 * The live try-on service: the Edge Function `studio-try-on` (decision 111,
 * computed placement: decision 111 (k)). The Supabase client sends the
 * member's token when signed in; the function reads the creation, checks the
 * owner's plan and the daily limits, and calls the models. Without a backend
 * (mock mode) the AI is simply not there.
 */

const FUNCTION = "studio-try-on";
/** The analysis: the photo check and one reading of the close-up, no image. */
const ANALYSE_TIMEOUT_MS = 60_000;
/** Generous: an image model takes from a few seconds to about a minute. */
const RENDER_TIMEOUT_MS = 120_000;

/** A refusal of the function, read like its answer; `network` when nothing came back. */
async function readError<T>(error: unknown, parse: (json: unknown) => T): Promise<T | { ok: false; code: "not_available" | "failed" | "network" }> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    if (response.status === 404 && !response.headers.get("content-type")?.includes("json")) return { ok: false, code: "not_available" };
    try {
      return parse(await response.json());
    } catch {
      return { ok: false, code: "failed" };
    }
  }
  return { ok: false, code: "network" };
}

/** One multipart call; an aborted or timed-out call resolves with `failed`. */
async function call<T>(form: FormData, timeout: number, parse: (json: unknown) => T, signal?: AbortSignal) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(stop, timeout);
  signal?.addEventListener("abort", stop);
  if (signal?.aborted) stop();
  try {
    const { data, error } = await supabase!.functions.invoke(FUNCTION, { body: form, signal: controller.signal });
    if (controller.signal.aborted) return { ok: false as const, code: "failed" as const };
    if (error) return await readError(error, parse);
    return parse(data);
  } catch {
    return { ok: false as const, code: controller.signal.aborted ? ("failed" as const) : ("network" as const) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

export const smileTryOnService: SmileTryOnService = supabase
  ? {
      async status() {
        try {
          const { data, error } = await supabase!.functions.invoke(FUNCTION, { body: { action: "status" } });
          return error ? UNAVAILABLE_STATUS : parseTryOnStatus(data);
        } catch {
          return UNAVAILABLE_STATUS;
        }
      },
      analyse({ photo, source }, options) {
        const form = new FormData();
        form.set("action", "analyse");
        form.set("source", JSON.stringify(sourcePayload(source)));
        form.set("photo", photo, "smile");
        return call(form, ANALYSE_TIMEOUT_MS, parseTryOnAnalysis, options?.signal);
      },
      render({ photo, source, design, guide, crop, marks }, options) {
        const form = new FormData();
        form.set("source", JSON.stringify(sourcePayload(source)));
        form.set("photo", photo, "smile");
        form.set("design", design, "design");
        form.set("guide", guide, "guide");
        form.set("crop", JSON.stringify({ x: crop.x, y: crop.y, width: crop.width, height: crop.height }));
        form.set("marks", String(marks));
        return call(form, RENDER_TIMEOUT_MS, parseTryOnResponse, options?.signal);
      },
    }
  : unavailableTryOnService;
