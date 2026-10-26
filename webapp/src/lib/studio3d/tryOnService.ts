import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { parseTryOnResponse, sourcePayload, unavailableTryOnService, type SmileTryOnService, type TryOnOutcome } from "./tryOn";

/**
 * The live try-on service: the Edge Function `studio-try-on` (decision 111).
 * The Supabase client sends the member's token when signed in; the function
 * reads the creation, checks the owner's plan and the daily limit, and calls
 * the image model. Without a backend (mock mode) the AI is simply not there.
 */

const FUNCTION = "studio-try-on";
/** Generous: an image model takes from a few seconds to about a minute. */
const RENDER_TIMEOUT_MS = 120_000;

async function readError(error: unknown): Promise<TryOnOutcome> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    if (response.status === 404 && !response.headers.get("content-type")?.includes("json")) return { ok: false, code: "not_available" };
    try {
      return parseTryOnResponse(await response.json());
    } catch {
      return { ok: false, code: "failed" };
    }
  }
  return { ok: false, code: "network" };
}

export const smileTryOnService: SmileTryOnService = supabase
  ? {
      async status() {
        try {
          const { data, error } = await supabase!.functions.invoke(FUNCTION, { body: { action: "status" } });
          return !error && !!data && (data as { available?: unknown }).available === true;
        } catch {
          return false;
        }
      },
      async render({ photo, source, design, seats }, options) {
        const form = new FormData();
        form.set("source", JSON.stringify(sourcePayload(source)));
        form.set("photo", photo, "smile");
        form.set("design", design, "design");
        if (seats?.length) form.set("seats", JSON.stringify(seats));
        try {
          const { data, error } = await supabase!.functions.invoke(FUNCTION, { body: form, signal: options?.signal, timeout: RENDER_TIMEOUT_MS });
          if (options?.signal?.aborted) return { ok: false, code: "failed" };
          return error ? await readError(error) : parseTryOnResponse(data);
        } catch {
          return { ok: false, code: options?.signal?.aborted ? "failed" : "network" };
        }
      },
    }
  : unavailableTryOnService;
