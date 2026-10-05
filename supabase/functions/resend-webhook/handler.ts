import { json } from "../_shared/http.ts";
import { verifySvixSignature } from "../_shared/svix.ts";

/**
 * POST /functions/v1/resend-webhook — Resend's delivery events.
 *
 * Deployed with verify_jwt = false (supabase/config.toml): Resend sends no
 * Supabase token; the Svix signature (RESEND_WEBHOOK_SECRET) is the
 * authentication, with a five-minute tolerance on its timestamp.
 *
 * email.delivered / opened / bounced / complained move the matching email_log
 * row forward (never back, see email_log_apply_event), and:
 *   - a gift card e-mail brings the card's delivery status to the log's status
 *     (delivered / opened / bounced; a complaint has no card status);
 *   - a newsletter e-mail's bounce or complaint marks the subscriber, inside
 *     the same database function.
 * Idempotent: a replay (same svix-id) finds the status already there and
 * changes nothing; the card is set from the log's current status, so a retry
 * after a failed card update heals it. Other event types, and e-mails that are
 * not in email_log (Auth e-mails also go through Resend), are acknowledged
 * and ignored. Provider data is never logged: no address, no subject.
 */

export type DeliveryStatus = "delivered" | "opened" | "bounced" | "complained";
export type CardStatus = "delivered" | "opened" | "bounced";

const EVENT_STATUS: Record<string, DeliveryStatus> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

const CARD_STATUSES = new Set<string>(["delivered", "opened", "bounced"]);
const MAX_BODY_BYTES = 256 * 1024;

export interface AppliedEvent {
  matched: boolean;
  applied: boolean;
  template: string | null;
  giftCardId: string | null;
  /** The log's status after the call (unchanged when applied is false). */
  status: string | null;
}

export interface WebhookDeps {
  /** RESEND_WEBHOOK_SECRET */
  secret: string | undefined;
  now(): Date;
  applyEvent(providerId: string, status: DeliveryStatus): Promise<AppliedEvent>;
  recordGiftCard(giftCardId: string, status: CardStatus): Promise<void>;
  log(message: string, detail?: unknown): void;
}

export async function handleResendWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!deps.secret?.trim()) {
    deps.log("RESEND_WEBHOOK_SECRET is not set");
    return json({ error: "server_error" }, 500);
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json({ error: "invalid_request" }, 400);
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "invalid_request" }, 400);

  if (!(await verifySvixSignature(raw, req.headers, deps.secret, deps.now()))) {
    return json({ error: "invalid_signature" }, 401);
  }

  let event: { type?: unknown; data?: { email_id?: unknown } } | null;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const type = event?.type;
  const status = typeof type === "string" && Object.hasOwn(EVENT_STATUS, type) ? EVENT_STATUS[type] : null;
  if (!status) return json({ ok: true, ignored: true }, 200);

  const providerId = event?.data?.email_id;
  if (typeof providerId !== "string" || providerId.length === 0 || providerId.length > 100) {
    return json({ error: "invalid_request" }, 400);
  }

  try {
    const result = await deps.applyEvent(providerId, status);
    if (!result.matched) return json({ ok: true, matched: false }, 200);
    if (result.giftCardId && result.status && CARD_STATUSES.has(result.status)) {
      await deps.recordGiftCard(result.giftCardId, result.status as CardStatus);
    }
    if (result.applied && (status === "bounced" || status === "complained")) {
      deps.log(`e-mail ${status}`, { template: result.template });
    }
    return json({ ok: true, matched: true, applied: result.applied }, 200);
  } catch (error) {
    // 500 makes Svix retry; the database work is idempotent.
    deps.log("resend webhook failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500);
  }
}
