import { clientAddress, corsHeaders, json, readJson, type SiteOrigins } from "../_shared/http.ts";
import { hashAddress } from "../_shared/email/send.ts";

/**
 * POST /functions/v1/gift-card-balance — the visitors' gift card balance check on /carte-cadeau
 * (decision 140). Members do not come here: they call check_gift_card_balance() with their own
 * session (throttled per account).
 *
 *   browser ──(JSON: code, captcha?, website?)──▶ this function
 *     1. validates the body (a code shaped like GT-XXXX-XXXX-XXXX, dashes and spaces optional)
 *     2. honeypot `website`: a bot that fills it gets the "not found" answer
 *     3. throttles by caller address (gift_card_balance_ip_allowed: 20 lookups / hour, hashed)
 *     4. Cloudflare Turnstile, once TURNSTILE_SECRET_KEY is set (the newsletter's keys)
 *     5. check_gift_card_balance_for_visitor(code, ip_hash) as the service role: refusals are
 *        throttled per address hash in the database (10 / 10 minutes, shared counter)
 *
 * Answers: `{ found: true, card: { status, balance, currency, expires_at, last4 } }`,
 * `{ found: false }` (unknown, unpaid, not yet delivered — always the same), or `{ error }`
 * with a short code (`invalid_request`, `rate_limited`, `captcha_required`, `captcha_failed`,
 * `server_error`). The code is never logged.
 */

const MAX_REQUEST_BYTES = 4 * 1024;
const MAX_CAPTCHA = 2048;
const CODE = /^GT-?[A-Z2-9]{4}-?[A-Z2-9]{4}-?[A-Z2-9]{4}$/;

export type CardStatus = "active" | "used_up" | "expired" | "cancelled";
export interface CardBalance {
  status: CardStatus;
  balance: number;
  currency: string;
  expires_at: string | null;
  last4: string;
}

export type LookupResult =
  | { found: true; card: CardBalance }
  | { found: false }
  | { error: "too_many_attempts" | "unavailable" };

export interface BalanceDeps {
  origins: SiteOrigins;
  captchaConfigured: boolean;
  verifyCaptcha(token: string, remoteIp: string | null): Promise<boolean>;
  /** False when this caller address has used up its lookups. */
  ipAllowed(ipHash: string): Promise<boolean>;
  /** check_gift_card_balance_for_visitor() as the service role. */
  lookup(code: string, ipHash: string): Promise<LookupResult>;
  log(message: string, detail?: unknown): void;
}

/** Upper case, spaces removed; null when it cannot be a gift card code. */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const code = raw.replace(/\s+/g, "").toUpperCase();
  return CODE.test(code) ? code : null;
}

const STATUSES: readonly string[] = ["active", "used_up", "expired", "cancelled"];

/** The database's jsonb answer, read defensively. */
export function readLookup(data: unknown): LookupResult {
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { error: row.error === "too_many_attempts" ? "too_many_attempts" : "unavailable" };
  if (row.found !== true) return { found: false };
  const card = (row.card ?? {}) as Record<string, unknown>;
  const balance = Number(card.balance);
  if (
    typeof card.status !== "string" || !STATUSES.includes(card.status) || !Number.isFinite(balance) ||
    typeof card.currency !== "string" || typeof card.last4 !== "string"
  ) {
    return { error: "unavailable" };
  }
  return {
    found: true,
    card: {
      status: card.status as CardStatus,
      balance,
      currency: card.currency,
      expires_at: typeof card.expires_at === "string" ? card.expires_at : null,
      last4: card.last4,
    },
  };
}

export async function handleBalance(req: Request, deps: BalanceDeps): Promise<Response> {
  const cors = corsHeaders(deps.origins, req.headers.get("Origin"));
  const reply = (body: unknown, status: number) => json(body, status, cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const raw = await readJson(req, MAX_REQUEST_BYTES);
  if (typeof raw !== "object" || raw === null) return reply({ error: "invalid_request" }, 400);
  const body = raw as Record<string, unknown>;
  const captcha = typeof body.captcha === "string" ? body.captcha.trim() : "";
  if (captcha.length > MAX_CAPTCHA) return reply({ error: "invalid_request" }, 400);
  const code = normaliseCode(body.code);
  if (!code) return reply({ error: "invalid_request" }, 400);
  // Honeypot: a field no person sees.
  if (typeof body.website === "string" && body.website.trim() !== "") return reply({ found: false }, 200);

  const ip = clientAddress(req);
  // Without the platform's address header every caller shares one bucket: stricter, never looser.
  const ipHash = await hashAddress(ip ?? "unknown");
  try {
    if (!(await deps.ipAllowed(ipHash))) return reply({ error: "rate_limited" }, 429);
  } catch (error) {
    deps.log("address throttle failed", error instanceof Error ? error.message : error);
    return reply({ error: "server_error" }, 500);
  }

  if (deps.captchaConfigured) {
    if (!captcha) return reply({ error: "captcha_required" }, 400);
    let passed: boolean;
    try {
      passed = await deps.verifyCaptcha(captcha, ip);
    } catch (error) {
      deps.log("captcha check failed", error instanceof Error ? error.message : error);
      return reply({ error: "server_error" }, 502);
    }
    if (!passed) return reply({ error: "captcha_failed" }, 400);
  }

  let result: LookupResult;
  try {
    result = await deps.lookup(code, ipHash);
  } catch (error) {
    deps.log("balance lookup failed", error instanceof Error ? error.message : error);
    return reply({ error: "server_error" }, 500);
  }
  if ("error" in result) {
    return result.error === "too_many_attempts" ? reply({ error: "rate_limited" }, 429) : reply({ error: "server_error" }, 500);
  }
  return reply(result, 200);
}
