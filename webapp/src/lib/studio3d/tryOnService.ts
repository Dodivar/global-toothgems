import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import {
  parseTryOnEvent,
  parseTryOnResponse,
  sourcePayload,
  unavailableTryOnService,
  type SmileTryOnService,
  type TryOnOutcome,
  type TryOnStage,
} from "./tryOn";

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

/**
 * Read the function's progress stream to its final answer, reporting each
 * stage. A stream that ends without an answer is `failed`; an aborted read throws.
 */
async function readProgress(response: Response, onStage?: (stage: TryOnStage) => void): Promise<TryOnOutcome> {
  if (!response.body) return { ok: false, code: "failed" };
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value.replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const event = parseTryOnEvent(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
      if (event && "outcome" in event) {
        void reader.cancel().catch(() => {});
        return event.outcome;
      }
      if (event) onStage?.(event.stage);
    }
    if (done) return { ok: false, code: "failed" };
  }
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
        form.set("progress", "1");
        // One signal for the caller's cancel and the timeout, kept for the whole
        // stream (the client's own `timeout` would stop watching it once the headers arrive).
        const controller = new AbortController();
        const stop = () => controller.abort();
        const timer = setTimeout(stop, RENDER_TIMEOUT_MS);
        options?.signal?.addEventListener("abort", stop);
        if (options?.signal?.aborted) stop();
        try {
          const { data, error } = await supabase!.functions.invoke(FUNCTION, { body: form, signal: controller.signal });
          if (controller.signal.aborted) return { ok: false, code: "failed" };
          if (error) return await readError(error);
          // A function older than the progress stream answers with plain JSON.
          return data instanceof Response ? await readProgress(data, options?.onStage) : parseTryOnResponse(data);
        } catch {
          return { ok: false, code: options?.signal?.aborted || controller.signal.aborted ? "failed" : "network" };
        } finally {
          clearTimeout(timer);
          options?.signal?.removeEventListener("abort", stop);
        }
      },
    }
  : unavailableTryOnService;
