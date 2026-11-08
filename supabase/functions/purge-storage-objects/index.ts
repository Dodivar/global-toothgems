import { serviceClient } from "../_shared/clients.ts";
import {
  handlePurgeStorageObjects,
  purgeQueuedFiles,
  type PurgeStore,
  type QueuedFile,
} from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): called by pg_cron with the shared
 * secret, see handler.ts.
 */

const log = (message: string, detail?: unknown) =>
  console.error(`[purge-storage-objects] ${message}`, detail ?? "");

Deno.serve((req) =>
  handlePurgeStorageObjects(req, {
    secret: Deno.env.get("EMAIL_INTERNAL_SECRET"),
    run: () => {
      const db = serviceClient();
      const store: PurgeStore = {
        async pending(limit) {
          const { data, error } = await db.rpc("pending_storage_purges", {
            p_limit: limit,
          });
          if (error) {
            throw new Error(`pending_storage_purges: ${error.message}`);
          }
          return ((data ?? []) as Record<string, unknown>[]).map((
            row,
          ): QueuedFile => ({
            id: Number(row.id),
            bucket: String(row.bucket_id),
            name: String(row.name),
          }));
        },
        async record(done, failed, message) {
          const { error } = await db.rpc("record_storage_purges", {
            p_done: done,
            p_failed: failed,
            p_error: message,
          });
          if (error) throw new Error(`record_storage_purges: ${error.message}`);
        },
      };
      return purgeQueuedFiles(store, async (bucket, names) => {
        const { error } = await db.storage.from(bucket).remove(names);
        if (error) {
          throw new Error(`storage remove (${bucket}): ${error.message}`);
        }
      }, log);
    },
    log,
  })
);
