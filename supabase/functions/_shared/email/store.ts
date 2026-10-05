/**
 * Database side of the e-mail module: the template lookup and the `email_log`
 * claim, through service-role-only functions (migration `email_log`).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import type { Claim, ClaimEntry, EmailStore } from "./send.ts";
import type { TemplateRow } from "./render.ts";

export function supabaseEmailStore(db: SupabaseClient): EmailStore {
  return {
    async loadTemplate(key: string, locale: string): Promise<TemplateRow | null> {
      const { data, error } = await db.rpc("email_template_for", { p_key: key, p_locale: locale });
      if (error) throw new Error(`email_template_for failed: ${error.message}`);
      const row = (data as TemplateRow[] | null)?.[0];
      return row ?? null;
    },

    async claim(entry: ClaimEntry): Promise<Claim> {
      const { data, error } = await db.rpc("email_log_claim", {
        p_event_key: entry.eventKey,
        p_template_key: entry.templateKey,
        p_locale: entry.locale,
        p_recipient_hash: entry.recipientHash,
        p_order_id: entry.orderId ?? null,
        p_gift_card_id: entry.giftCardId ?? null,
      });
      if (error) throw new Error(`email_log_claim failed: ${error.message}`);
      const row = (data as { claimed: boolean; attempt: number; status: string }[] | null)?.[0];
      if (!row) throw new Error("email_log_claim returned nothing");
      return row.claimed ? { claimed: true, attempt: row.attempt } : { claimed: false, status: row.status };
    },

    async markSent(eventKey: string, providerId: string): Promise<void> {
      const { error } = await db.rpc("email_log_finish", {
        p_event_key: eventKey,
        p_status: "sent",
        p_provider_id: providerId,
        p_error: null,
      });
      if (error) throw new Error(`email_log_finish failed: ${error.message}`);
    },

    async markFailed(eventKey: string, message: string): Promise<void> {
      const { error } = await db.rpc("email_log_finish", {
        p_event_key: eventKey,
        p_status: "failed",
        p_provider_id: null,
        p_error: message,
      });
      if (error) throw new Error(`email_log_finish failed: ${error.message}`);
    },
  };
}
