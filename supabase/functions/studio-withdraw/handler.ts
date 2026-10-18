import { corsHeaders, json, type SiteOrigins } from "../_shared/http.ts";
import { bearer, looksLikeJwt } from "../_shared/studioBilling.ts";
import type { WithdrawalOutcome } from "../_shared/studioWithdrawal.ts";

/**
 * POST /functions/v1/studio-withdraw   {}  (the member's token)
 *
 * The signed-in member withdraws from their 3D Studio subscription within 14
 * days (decision 95): see `_shared/studioWithdrawal.ts`. The body carries
 * nothing — no amount, no subscription id: the account comes from the token,
 * the eligibility and the amounts from the database.
 *
 *   200 { status, used_days, period_days, used_amount, refund_amount, currency }  (minor units)
 *   409 { error: no_subscription | not_paid | renewal | manual_review | deadline_passed | withdrawn }
 *   502 { error: withdrawal_incomplete, step }   decided, a Stripe step failed: calling again resumes it
 */

export interface StudioWithdrawDeps {
  origins: SiteOrigins;
  userFromToken(token: string): Promise<string | null>;
  withdraw(userId: string): Promise<WithdrawalOutcome>;
  log(message: string, detail?: unknown): void;
}

const MAX_BODY_BYTES = 256;

async function emptyBody(req: Request): Promise<boolean> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return false;
  if (!raw.trim()) return true;
  try {
    const body = JSON.parse(raw);
    return !!body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0;
  } catch {
    return false;
  }
}

export async function handleStudioWithdraw(req: Request, deps: StudioWithdrawDeps): Promise<Response> {
  const cors = corsHeaders(deps.origins, req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return json({ error: "sign_in_required" }, 401, cors);
  if (!(await emptyBody(req))) return json({ error: "invalid_request" }, 400, cors);

  let userId: string | null;
  try {
    userId = await deps.userFromToken(token);
  } catch (error) {
    deps.log("token check failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500, cors);
  }
  if (!userId) return json({ error: "session_expired" }, 401, cors);

  let outcome: WithdrawalOutcome;
  try {
    outcome = await deps.withdraw(userId);
  } catch (error) {
    deps.log("withdrawal failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500, cors);
  }
  switch (outcome.kind) {
    case "refused":
      return json({ error: outcome.refusal }, 409, cors);
    case "incomplete":
      return json({ error: "withdrawal_incomplete", step: outcome.step }, 502, cors);
    case "done": {
      const s = outcome.summary;
      return json(
        {
          status: s.status,
          used_days: s.usedDays,
          period_days: s.periodDays,
          used_amount: s.usedAmount,
          refund_amount: s.refundAmount,
          currency: s.currency,
        },
        200,
        cors,
      );
    }
  }
}
