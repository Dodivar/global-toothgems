import { hasInternalSecret } from "../_shared/internalAuth.ts";
import { json } from "../_shared/http.ts";

/*
 * Retention purge, Storage half (decision 127). The nightly SQL purge
 * (private.purge_expired_personal_data) deletes expired rows and queues the
 * files they referenced in private.storage_purge_queue: Storage objects cannot
 * be deleted from SQL. This sweep removes them through the Storage API and
 * clears the queue.
 *
 * verify_jwt = false, authenticated by EMAIL_INTERNAL_SECRET in `x-internal-secret`
 * (pg_cron, through private.call_email_function).
 *
 * A file leaves the queue only once Storage accepted its removal (removing a
 * file already gone succeeds too); a failed batch stays queued with its
 * attempt counted, and is retried the next night.
 */

export interface QueuedFile {
  id: number;
  bucket: string;
  name: string;
}

export interface PurgeStore {
  pending(limit: number): Promise<QueuedFile[]>;
  record(done: number[], failed: number[], error: string | null): Promise<void>;
}

export interface PurgeReport {
  removed: number;
  failed: number;
}

/** Buckets the sweep may empty: those the SQL queue accepts. */
export const PURGEABLE_BUCKETS: ReadonlySet<string> = new Set([
  "contact-attachments",
]);

const BATCH = 100;
const MAX_BATCHES = 10;

export async function purgeQueuedFiles(
  store: PurgeStore,
  removeFiles: (bucket: string, names: string[]) => Promise<void>,
  log: (message: string, detail?: unknown) => void,
): Promise<PurgeReport> {
  const report: PurgeReport = { removed: 0, failed: 0 };
  const failedIds = new Set<number>();

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    // Files that failed in this run are skipped until the next one.
    const rows = (await store.pending(BATCH + failedIds.size)).filter((row) =>
      !failedIds.has(row.id)
    ).slice(0, BATCH);
    if (rows.length === 0) break;

    const byBucket = new Map<string, QueuedFile[]>();
    for (const row of rows) {
      byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row]);
    }

    for (const [bucket, files] of byBucket) {
      const ids = files.map((f) => f.id);
      if (!PURGEABLE_BUCKETS.has(bucket)) {
        ids.forEach((id) => failedIds.add(id));
        report.failed += ids.length;
        await store.record([], ids, `bucket not purgeable: ${bucket}`);
        continue;
      }
      try {
        await removeFiles(bucket, files.map((f) => f.name));
        report.removed += ids.length;
        await store.record(ids, [], null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log("removal failed", { bucket, count: ids.length, message });
        ids.forEach((id) => failedIds.add(id));
        report.failed += ids.length;
        await store.record([], ids, message.slice(0, 500));
      }
    }
    if (rows.length < BATCH) break;
  }
  return report;
}

export interface PurgeDeps {
  /** EMAIL_INTERNAL_SECRET */
  secret: string | undefined;
  run(): Promise<PurgeReport>;
  log(message: string, detail?: unknown): void;
}

export async function handlePurgeStorageObjects(
  req: Request,
  deps: PurgeDeps,
): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await hasInternalSecret(req, deps.secret))) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    return json({ ok: true, report: await deps.run() }, 200);
  } catch (error) {
    deps.log("sweep failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500);
  }
}
