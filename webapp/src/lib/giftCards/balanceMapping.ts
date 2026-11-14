import { toMinorUnits } from "../catalog/money";

/**
 * Pure helpers of the gift card balance check (decision 140): what the person typed, and the
 * answers of check_gift_card_balance() / the Edge Function `gift-card-balance` read into one
 * outcome the screens show. The code itself never appears in an outcome (last 4 only).
 */

export type BalanceStatus = "active" | "used_up" | "expired" | "cancelled";

export interface BalanceCard {
  status: BalanceStatus;
  /** Integer minor units (cents). */
  balanceMinor: number;
  currency: string;
  expiresAt: string | null;
  last4: string;
}

export type BalanceError = "invalid" | "rate_limited" | "captcha_required" | "captcha_failed" | "unavailable";

export type BalanceOutcome =
  | { kind: "found"; card: BalanceCard }
  | { kind: "not_found" }
  | { kind: "error"; error: BalanceError };

const CODE = /^GT-?[A-Z2-9]{4}-?[A-Z2-9]{4}-?[A-Z2-9]{4}$/;

/** Upper case, spaces removed; null when it cannot be a gift card code (checked again by the server). */
export function normaliseBalanceCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, "").toUpperCase();
  return code.length <= 20 && CODE.test(code) ? code : null;
}

const STATUSES: readonly BalanceStatus[] = ["active", "used_up", "expired", "cancelled"];

function readCard(value: unknown): BalanceCard | null {
  if (typeof value !== "object" || value === null) return null;
  const card = value as Record<string, unknown>;
  const status = card.status;
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) return null;
  if (typeof card.currency !== "string" || typeof card.last4 !== "string") return null;
  if (typeof card.balance !== "number" && typeof card.balance !== "string") return null;
  let balanceMinor: number;
  try {
    balanceMinor = toMinorUnits(card.balance);
  } catch {
    return null;
  }
  return {
    status: status as BalanceStatus,
    balanceMinor: Math.max(0, balanceMinor),
    currency: card.currency,
    expiresAt: typeof card.expires_at === "string" ? card.expires_at : null,
    last4: card.last4.slice(-4),
  };
}

/** check_gift_card_balance()'s jsonb: `{ok, found, card}` or `{ok: false, error}`. */
export function readMemberAnswer(data: unknown): BalanceOutcome {
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) return { kind: "error", error: row.error === "too_many_attempts" ? "rate_limited" : "unavailable" };
  if (row.found !== true) return { kind: "not_found" };
  const card = readCard(row.card);
  return card ? { kind: "found", card } : { kind: "error", error: "unavailable" };
}

/** The Edge Function's 200 answer: `{found, card}`. */
export function readVisitorAnswer(data: unknown): BalanceOutcome {
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.found === false) return { kind: "not_found" };
  const card = row.found === true ? readCard(row.card) : null;
  return card ? { kind: "found", card } : { kind: "error", error: "unavailable" };
}

const ERRORS: readonly BalanceError[] = ["rate_limited", "captcha_required", "captcha_failed"];

/** The Edge Function's `{error}` code; `invalid_request` and anything unknown read as their screen error. */
export function readVisitorError(code: unknown): BalanceError {
  if (code === "invalid_request") return "invalid";
  return (ERRORS as readonly unknown[]).includes(code) ? (code as BalanceError) : "unavailable";
}
