import { serviceClient } from "../_shared/clients.ts";
import { emailDepsFromEnv } from "../_shared/email/mod.ts";
import { sendPendingEmails, supabasePendingSource } from "../_shared/email/events.ts";
import { supabaseInvoiceSource } from "../_shared/email/invoicePdf.ts";
import { handleSendPendingEmails } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): called by pg_cron
 * with the shared secret, see handler.ts.
 */

const log = (message: string, detail?: unknown) => console.error(`[send-pending-emails] ${message}`, detail ?? "");

Deno.serve((req) =>
  handleSendPendingEmails(req, {
    secret: Deno.env.get("EMAIL_INTERNAL_SECRET"),
    run: (limit) => {
      const db = serviceClient();
      return sendPendingEmails(emailDepsFromEnv(), supabasePendingSource(db), { limit, log, invoices: supabaseInvoiceSource(db) });
    },
    log,
  })
);
