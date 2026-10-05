import { serviceClient } from "../_shared/clients.ts";
import { type AppliedEvent, type CardStatus, type DeliveryStatus, handleResendWebhook } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): Resend calls it with
 * a Svix signature, see handler.ts.
 */

const log = (message: string, detail?: unknown) => console.error(`[resend-webhook] ${message}`, detail ?? "");

type ApplyRow = {
  matched: boolean;
  applied: boolean;
  template: string | null;
  gift_card: string | null;
  new_status: string | null;
};

Deno.serve((req) => {
  const db = serviceClient();
  return handleResendWebhook(req, {
    secret: Deno.env.get("RESEND_WEBHOOK_SECRET"),
    now: () => new Date(),
    async applyEvent(providerId: string, status: DeliveryStatus): Promise<AppliedEvent> {
      const { data, error } = await db.rpc("email_log_apply_event", { p_provider_id: providerId, p_status: status });
      if (error) throw new Error(`email_log_apply_event failed: ${error.message}`);
      const row = (data as ApplyRow[] | null)?.[0];
      if (!row) throw new Error("email_log_apply_event returned nothing");
      return { matched: row.matched, applied: row.applied, template: row.template, giftCardId: row.gift_card, status: row.new_status };
    },
    async recordGiftCard(giftCardId: string, status: CardStatus): Promise<void> {
      const { error } = await db.rpc("record_gift_card_delivery", { p_gift_card_id: giftCardId, p_status: status });
      // 23514: the card is no longer active (cancelled, expired): nothing to record, and a retry would not change that.
      if (error && error.code !== "23514") throw new Error(`record_gift_card_delivery failed: ${error.message}`);
    },
    log,
  });
});
