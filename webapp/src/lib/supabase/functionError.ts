import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * What a failed Edge Function call (`supabase.functions.invoke`) tells the
 * browser: either the function answered with an HTTP error — its status and
 * its JSON body, `undefined` when the body was not JSON — or nothing answered
 * at all (network, relay). Every persistence boundary that calls a function
 * maps this to its own localized error codes.
 */
export type FunctionFailure = { kind: "http"; status: number; body: unknown } | { kind: "network" };

export async function readFunctionFailure(error: unknown): Promise<FunctionFailure> {
  if (!(error instanceof FunctionsHttpError)) return { kind: "network" };
  const response = error.context as Response;
  try {
    return { kind: "http", status: response.status, body: await response.json() };
  } catch {
    return { kind: "http", status: response.status, body: undefined };
  }
}

/** The `error` code of a function's JSON answer (`{ "error": "rate_limited" }`), if any. */
export function functionErrorCode(body: unknown): unknown {
  return typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
}

/** `value` when it is one of `values`, else `fallback` (unknown codes never reach the screens). */
export function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return (values as readonly unknown[]).includes(value) ? (value as T) : fallback;
}
