import { serviceClient } from "../_shared/clients.ts";
import { emailDepsFromEnv } from "../_shared/email/mod.ts";
import { sendPendingEmails, supabasePendingSource } from "../_shared/email/events.ts";
import { supabaseInvoiceSource } from "../_shared/email/invoicePdf.ts";
import { supabaseTermsProvider } from "../_shared/email/termsPdf.ts";
import { sendOrderWithdrawalEmails, supabaseWithdrawalSource } from "../_shared/email/withdrawalEmails.ts";
import { sendLoungeModerationEmails, supabaseModerationMailSource } from "../_shared/email/loungeModerationEmails.ts";
import { handleSendPendingEmails } from "./handler.ts";
import { functionLogger } from "../_shared/log.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): called by pg_cron
 * with the shared secret, see handler.ts. The order and Studio e-mails carry
 * the invoices and credit notes the database issued, as PDFs; the contract
 * confirmations (course enrolment, Studio subscription) the terms of sale.
 */

const log = functionLogger("send-pending-emails");

Deno.serve((req) =>
  handleSendPendingEmails(req, {
    secret: Deno.env.get("EMAIL_INTERNAL_SECRET"),
    run: async (limit) => {
      const db = serviceClient();
      const documents = supabaseInvoiceSource(db);
      const deps = emailDepsFromEnv();
      const report = await sendPendingEmails(deps, supabasePendingSource(db), {
        limit,
        log,
        invoices: documents,
        studioDocuments: documents,
        terms: supabaseTermsProvider(db, log),
        mediaBaseUrl: `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/product-media`,
      });
      // Shop withdrawal acknowledgements that order-withdrawal could not send at once (decision 131).
      let orderWithdrawal;
      try {
        orderWithdrawal = await sendOrderWithdrawalEmails(deps, supabaseWithdrawalSource(db), { limit, log });
      } catch (error) {
        log("order withdrawal sweep failed", error instanceof Error ? error.message : error);
        orderWithdrawal = { examined: 0, sent: 0, skipped: 0, failed: 1 };
      }
      // Members' Lounge moderation (decision 132): statements of reasons, report outcomes, complaint answers.
      let loungeModeration;
      try {
        loungeModeration = await sendLoungeModerationEmails(deps, supabaseModerationMailSource(db), { limit, log });
      } catch (error) {
        log("lounge moderation sweep failed", error instanceof Error ? error.message : error);
        loungeModeration = { examined: 0, sent: 0, skipped: 0, failed: 1 };
      }
      return { ...report, orderWithdrawal, loungeModeration };
    },
    log,
  })
);
