import { supabase } from "./supabase/client";
import { parseAccessRow, type StudioAccessInfo } from "./studioAccessState";

/**
 * The persistence boundary of Studio access: the two database functions and
 * the count of the member's saved designs (shown on the locked screen, so the
 * member knows their work is kept). Screens go through `studioAccess.tsx`.
 */

export class StudioAccessError extends Error {
  readonly kind: "unavailable" | "invalid";
  constructor(kind: "unavailable" | "invalid") {
    super(kind);
    this.kind = kind;
    this.name = "StudioAccessError";
  }
}

function client() {
  if (!supabase) throw new StudioAccessError("unavailable");
  return supabase;
}

function parsed(data: unknown): StudioAccessInfo {
  const info = parseAccessRow(data);
  if (!info) throw new StudioAccessError("invalid");
  return info;
}

export async function fetchStudioAccess(): Promise<StudioAccessInfo> {
  const { data, error } = await client().rpc("studio_access_state");
  if (error) throw new StudioAccessError("unavailable");
  return parsed(data);
}

/** Starts the trial once; `started` is true only for the call that created it. */
export async function startStudioTrial(): Promise<{ info: StudioAccessInfo; started: boolean }> {
  const { data, error } = await client().rpc("start_studio_trial");
  if (error) throw new StudioAccessError("unavailable");
  const started = !!data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).started === true;
  return { info: parsed(data), started };
}

/** How many designs the member has saved (their own rows only: RLS). */
export async function countSavedCreations(): Promise<number | null> {
  const { count, error } = await client().from("creations").select("id", { count: "exact", head: true });
  return error ? null : (count ?? 0);
}
