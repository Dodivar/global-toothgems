import { requireEnv, serviceClient } from "../_shared/clients.ts";
import { handleSyncNewsletterContacts, type PendingContact, type SyncStore, syncNewsletterContacts } from "./handler.ts";
import { resendContactsApi } from "./resendContacts.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): called by pg_cron with the shared
 * secret, see handler.ts. RESEND_API_KEY must be allowed to manage contacts (a "full access"
 * key); a sending-only key is answered 401/403 and the run stops, saying so.
 */

const log = (message: string, detail?: unknown) => console.error(`[sync-newsletter-contacts] ${message}`, detail ?? "");

function supabaseSyncStore(): SyncStore {
  const db = serviceClient();
  return {
    async pending(limit) {
      const { data, error } = await db.rpc("pending_newsletter_contacts", { p_limit: limit });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((row): PendingContact => ({
        id: String(row.id),
        email: String(row.email),
        subscribed: row.subscribed === true,
        locale: String(row.locale ?? "fr"),
        firstName: typeof row.first_name === "string" ? row.first_name : null,
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        dueAt: String(row.due_at),
      }));
    },
    async record(id, dueAt, error) {
      const { error: dbError } = await db.rpc("record_newsletter_contact_sync", { p_id: id, p_due_at: dueAt, p_error: error });
      if (dbError) log("record failed", { id, message: dbError.message });
    },
    async optOut(email) {
      const { error } = await db.rpc("newsletter_resend_opt_out", { p_email: email, p_reason: "unsubscribed" });
      if (error) throw new Error(`newsletter_resend_opt_out failed: ${error.message}`);
    },
  };
}

Deno.serve((req) =>
  handleSyncNewsletterContacts(req, {
    secret: Deno.env.get("EMAIL_INTERNAL_SECRET"),
    run: (limit) => syncNewsletterContacts(resendContactsApi({ apiKey: requireEnv("RESEND_API_KEY") }), supabaseSyncStore(), limit, log),
    log,
  })
);
