import { hasInternalSecret } from "../_shared/internalAuth.ts";
import { json, readJson } from "../_shared/http.ts";
import type { DeliveryReport } from "../_shared/email/giftCards.ts";

/**
 * POST /functions/v1/deliver-gift-cards — e-mails the code of every gift card
 * that is active and due (immediate cards the checkout hook missed, scheduled
 * deliveries whose day has come, retries). Called by pg_cron every 5 minutes.
 *
 * Deployed with verify_jwt = false (supabase/config.toml): the caller is the
 * database or the team, not a browser. Authentication is the shared secret
 * EMAIL_INTERNAL_SECRET in the `x-internal-secret` header.
 *
 * Body (optional): { "limit": 1..100 } — cards per run, default 25.
 * Answer: { ok: true, report } with the counts of DeliveryReport; the codes
 * never leave this function.
 */

export interface DeliverDeps {
  /** EMAIL_INTERNAL_SECRET */
  secret: string | undefined;
  run(limit: number): Promise<DeliveryReport>;
  log(message: string, detail?: unknown): void;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function handleDeliverGiftCards(req: Request, deps: DeliverDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await hasInternalSecret(req, deps.secret))) return json({ error: "unauthorized" }, 401);

  let limit = DEFAULT_LIMIT;
  if (req.headers.get("content-length") !== "0") {
    const body = await readJson(req, 1024);
    if (body !== null && typeof body === "object" && "limit" in body) {
      const asked = (body as { limit: unknown }).limit;
      if (typeof asked !== "number" || !Number.isInteger(asked) || asked < 1 || asked > MAX_LIMIT) {
        return json({ error: "invalid_limit" }, 400);
      }
      limit = asked;
    }
  }

  try {
    return json({ ok: true, report: await deps.run(limit) }, 200);
  } catch (error) {
    deps.log("delivery run failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500);
  }
}
