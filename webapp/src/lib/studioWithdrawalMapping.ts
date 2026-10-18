import { toMinorUnits } from "./catalog/money";

/**
 * Withdrawing from a 3D Studio subscription within 14 days (decision 95): the
 * shapes of `studio_withdrawal_quote()` and of the `studio-withdraw` answer.
 * Pure. Amounts become integer minor units; anything malformed reads as
 * "nothing to offer" rather than a guess.
 */

export type WithdrawalRefusal = "no_subscription" | "not_paid" | "renewal" | "manual_review" | "deadline_passed" | "withdrawn";
export type WithdrawalStatus = "requested" | "refund_pending" | "refunded" | "refund_failed" | "no_refund";

export interface WithdrawalFigures {
  usedDays: number;
  periodDays: number;
  /** Minor units. */
  paid: number;
  used: number;
  refund: number;
  currency: string;
}

export type WithdrawalQuote =
  | { kind: "open"; deadline: string; figures: WithdrawalFigures }
  | { kind: "withdrawn"; status: WithdrawalStatus; requestedAt: string; refund: number; currency: string }
  /** Within the 14 days, but the team handles it (a plan change was paid). */
  | { kind: "contact"; deadline: string }
  | { kind: "none" };

export type WithdrawAnswer =
  | { kind: "done"; status: WithdrawalStatus; figures: Omit<WithdrawalFigures, "paid"> }
  | { kind: "refused"; reason: WithdrawalRefusal }
  /** Decided, a Stripe step failed: trying again resumes it. */
  | { kind: "incomplete" }
  | { kind: "error" };

const STATUSES: readonly WithdrawalStatus[] = ["requested", "refund_pending", "refunded", "refund_failed", "no_refund"];
const REFUSALS: readonly WithdrawalRefusal[] = ["no_subscription", "not_paid", "renewal", "manual_review", "deadline_passed", "withdrawn"];

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function minor(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  try {
    // A number is read through its own digits, so 1.234 is refused, never rounded.
    const result = toMinorUnits(typeof value === "number" ? String(value) : value);
    return Number.isSafeInteger(result) && result >= 0 ? result : null;
  } catch {
    return null;
  }
}

const isDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isCurrency = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{3}$/.test(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

export function readWithdrawalQuote(value: unknown): WithdrawalQuote {
  const q = record(value);
  if (q.eligible === true) {
    const paid = minor(q.paid_amount);
    const used = minor(q.used_amount);
    const refund = minor(q.refund_amount);
    if (!isDate(q.deadline) || !isCurrency(q.currency) || paid === null || used === null || refund === null) return { kind: "none" };
    if (!isCount(q.used_days) || !isCount(q.period_days)) return { kind: "none" };
    return {
      kind: "open",
      deadline: q.deadline,
      figures: { usedDays: q.used_days, periodDays: q.period_days, paid, used, refund, currency: q.currency },
    };
  }
  if (q.reason === "withdrawn") {
    const w = record(q.withdrawal);
    const refund = minor(w.refund_amount);
    if (!STATUSES.includes(w.status as WithdrawalStatus) || !isDate(w.requested_at) || refund === null || !isCurrency(w.currency)) {
      return { kind: "none" };
    }
    return { kind: "withdrawn", status: w.status as WithdrawalStatus, requestedAt: w.requested_at, refund, currency: w.currency };
  }
  if (q.reason === "manual_review" && isDate(q.deadline)) return { kind: "contact", deadline: q.deadline };
  return { kind: "none" };
}

/** The function's body (200, or an error code); amounts are already minor units there. */
export function readWithdrawAnswer(status: number, value: unknown): WithdrawAnswer {
  const body = record(value);
  if (status === 200) {
    if (!STATUSES.includes(body.status as WithdrawalStatus) || !isCurrency(body.currency)) return { kind: "error" };
    if (![body.used_days, body.period_days, body.used_amount, body.refund_amount].every(isCount)) return { kind: "error" };
    return {
      kind: "done",
      status: body.status as WithdrawalStatus,
      figures: {
        usedDays: body.used_days as number,
        periodDays: body.period_days as number,
        used: body.used_amount as number,
        refund: body.refund_amount as number,
        currency: body.currency,
      },
    };
  }
  if (REFUSALS.includes(body.error as WithdrawalRefusal)) return { kind: "refused", reason: body.error as WithdrawalRefusal };
  if (body.error === "withdrawal_incomplete") return { kind: "incomplete" };
  return { kind: "error" };
}
