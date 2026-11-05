import type { TryOnAnalysis, TryOnAudience, TryOnCreation, TryOnSource } from "./tryOn";

/**
 * The try-ons kept on this device (2026-11-05, owner's request): the photo,
 * the analysis and the generated image, in the browser's IndexedDB only —
 * never sent anywhere, never readable by Global Toothgems. They let a render
 * survive the dialog being closed, the page being reloaded or the phone going
 * to sleep, and let the member find their last results again.
 *
 * Kept at most `TRY_ON_KEEP_MS` (24 h) and `TRY_ON_KEEP_MAX` runs, for the
 * signed-in account that made them only: everything is erased when nobody is
 * signed in any more (sign-out, a shared device) and another account's runs
 * are erased when someone else signs in. Each run is its own record: "Generate
 * again" adds one, a failed or cancelled run is deleted.
 *
 * Every call swallows its errors (private browsing, storage blocked or full):
 * the try-on then simply works as before, in this tab only.
 */

export const TRY_ON_KEEP_MS = 24 * 3600 * 1000;
export const TRY_ON_KEEP_MAX = 12;

/** A run: "running" until it ends; a "running" record found on load was interrupted (closed tab, reload). */
export interface StoredTryOn {
  id: string;
  userId: string;
  createdAt: number;
  creation: TryOnCreation;
  source: TryOnSource;
  audience: TryOnAudience;
  photo: { blob: Blob; width: number; height: number };
  /** Step 1's answer, once known: a resumed or regenerated run skips the analysis. */
  analysis?: TryOnAnalysis;
  state: "running" | "done";
  result?: { image: Blob; leftOut: number };
}

/** Which creation a run is for, whatever object the caller passed. */
export function sourceKey(source: TryOnSource): string {
  switch (source.kind) {
    case "own":
      return `own:${source.creationId}`;
    case "share":
      return `share:${source.token}`;
    case "glowbook":
      return `glowbook:${source.handle}/${source.itemId}`;
  }
}

/**
 * The records to erase: another account's (or all of them when nobody is
 * signed in), expired ones, and, past the newest `TRY_ON_KEEP_MAX`, the oldest.
 */
export function recordsToErase(records: readonly Pick<StoredTryOn, "id" | "userId" | "createdAt">[], userId: string | null, now: number): string[] {
  const erase = new Set<string>();
  const kept = [...records]
    .filter((r) => {
      const gone = !userId || r.userId !== userId || now - r.createdAt > TRY_ON_KEEP_MS || r.createdAt > now + 60_000;
      if (gone) erase.add(r.id);
      return !gone;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const r of kept.slice(TRY_ON_KEEP_MAX)) erase.add(r.id);
  return [...erase];
}

const DB_NAME = "gt-studio-try-on";
const STORE = "runs";
/**
 * Set while the database may hold runs: a visitor who never tried a smile on
 * never has the database opened (nor created) by the page load's clean-up.
 */
const FLAG = "gt-try-on-local";

function flagged(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return true; // storage unreadable: look in the database (it fails quietly too)
  }
}

function setFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    /* nothing to remember */
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const db = () => (dbPromise ??= openDb());

/** One transaction; resolves with `fallback` on any failure. */
async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | null, fallback: T): Promise<T> {
  const database = await db();
  if (!database) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const tx = database.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? (request.result as T) ?? fallback : fallback);
      tx.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
    } catch {
      resolve(fallback);
    }
  });
}

/** Write (or overwrite) a run. */
export function saveRun(run: StoredTryOn): Promise<void> {
  setFlag(true);
  return withStore("readwrite", (store) => store.put(run), undefined);
}

export function deleteRun(id: string): Promise<void> {
  return withStore("readwrite", (store) => store.delete(id), undefined);
}

/**
 * The runs of `userId`, newest first, after erasing what must go
 * (`recordsToErase`). Signed out (`null`): everything is erased.
 */
export async function loadRuns(userId: string | null, now = Date.now()): Promise<StoredTryOn[]> {
  if (!flagged()) return [];
  const all = await withStore<StoredTryOn[]>("readonly", (store) => store.getAll(), []);
  const erase = new Set(recordsToErase(all, userId, now));
  if (erase.size > 0) await withStore("readwrite", (store) => (erase.forEach((id) => store.delete(id)), null), undefined);
  const kept = all.filter((r) => !erase.has(r.id)).sort((a, b) => b.createdAt - a.createdAt);
  if (kept.length === 0) setFlag(false);
  return kept;
}
