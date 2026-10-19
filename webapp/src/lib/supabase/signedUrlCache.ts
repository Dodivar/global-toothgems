import type { TypedSupabaseClient } from "./client";

/**
 * Signed URLs that stay the same for as long as they are valid.
 *
 * A signed URL carries a fresh token every time it is signed, so the browser
 * cache and the Storage CDN see a new address and download the file again.
 * Re-signing everything on a timer (or on every page load) therefore
 * re-downloads every image on screen — this is what drove the Storage egress
 * in October 2026. Here a URL is reused until it gets close to its expiry,
 * and only the URLs that do are signed again.
 *
 * The cache is per signed-in user (a URL signed for one account is never
 * handed to another in the same tab), kept in memory and in sessionStorage
 * so a reload of the tab reuses the same addresses. It is only read and
 * written from effects and event handlers, never during render.
 */

export interface CachedSignedUrl {
  url: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface StableSignOptions {
  bucket: string;
  /** Lifetime asked for newly signed URLs. */
  ttlSeconds: number;
  /** A cached URL with less life left than this is signed again. */
  minRemainingSeconds: number;
}

const STORAGE_KEY = "gt-signed-urls";
/** Bounds what sessionStorage keeps (oldest expiry first out). */
const MAX_ENTRIES = 500;

let memory: Map<string, CachedSignedUrl> | null = null;

function cacheKey(scope: string, bucket: string, path: string): string {
  return `${scope}|${bucket}|${path}`;
}

/** Entries read back from sessionStorage, keeping only well-formed ones still valid at `now`. */
export function parseStoredSignedUrls(raw: string | null, now: number): Map<string, CachedSignedUrl> {
  const result = new Map<string, CachedSignedUrl>();
  if (!raw) return result;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const { url, expiresAt } = value as Record<string, unknown>;
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) continue;
      if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= now) continue;
      result.set(key, { url, expiresAt });
    }
  } catch {
    // Unreadable: start empty.
  }
  return result;
}

function load(now: number): Map<string, CachedSignedUrl> {
  if (memory) return memory;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: memory only.
  }
  memory = parseStoredSignedUrls(raw, now);
  return memory;
}

function persist(cache: Map<string, CachedSignedUrl>, now: number): void {
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  const kept = [...cache].sort((a, b) => b[1].expiresAt - a[1].expiresAt).slice(0, MAX_ENTRIES);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage blocked or full: the memory cache still works for this page.
  }
}

/** Which paths can keep their cached URL and which must be signed. */
export function partitionPaths(
  cache: ReadonlyMap<string, CachedSignedUrl>,
  keyOf: (path: string) => string,
  paths: readonly string[],
  now: number,
  minRemainingMs: number,
): { reused: Map<string, string>; toSign: string[] } {
  const reused = new Map<string, string>();
  const toSign: string[] = [];
  for (const path of new Set(paths)) {
    const entry = cache.get(keyOf(path));
    if (entry && entry.expiresAt - now > minRemainingMs) reused.set(path, entry.url);
    else toSign.push(path);
  }
  return { reused, toSign };
}

/**
 * Signed URLs by path for the current user. Cached URLs with enough life left
 * come back unchanged; the others are signed in one call. Storage RLS still
 * decides: a path the user may not read comes back without a URL. Throws
 * when the signing call itself fails.
 */
export async function stableSignedUrls(
  db: TypedSupabaseClient,
  paths: readonly string[],
  { bucket, ttlSeconds, minRemainingSeconds }: StableSignOptions,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data: session } = await db.auth.getSession();
  const scope = session.session?.user.id ?? "anonymous";
  const now = Date.now();
  const cache = load(now);
  const keyOf = (path: string) => cacheKey(scope, bucket, path);
  const { reused, toSign } = partitionPaths(cache, keyOf, paths, now, minRemainingSeconds * 1000);
  if (toSign.length === 0) return reused;

  const { data, error } = await db.storage.from(bucket).createSignedUrls(toSign, ttlSeconds);
  if (error) throw error;
  // Counted from before the call: the URL never outlives what we record.
  const expiresAt = now + ttlSeconds * 1000;
  for (const entry of data ?? []) {
    if (!entry.path || !entry.signedUrl || entry.error) continue;
    reused.set(entry.path, entry.signedUrl);
    cache.set(keyOf(entry.path), { url: entry.signedUrl, expiresAt });
  }
  persist(cache, now);
  return reused;
}

/** Test hook: forget the module's memory cache. */
export function resetSignedUrlCacheForTests(): void {
  memory = null;
}
