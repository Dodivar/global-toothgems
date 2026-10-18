import { useEffect, useState } from "react";
import { SHOP_TIME_ZONE } from "../data/adminAnalytics";
import { periodInstants, type Period } from "./adminAnalyticsMapping";
import { toMinorUnits } from "./catalog/money";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";

/**
 * The 3D Studio money of `/admin/statistiques` (decision 95), aggregated in the
 * browser from the rows `view_statistics` staff read (`studio_subscription_invoices`,
 * `studio_withdrawals`), like the trial panel — no statistics function in the
 * database.
 *
 * Each paid invoice of the period is split three ways:
 *   - withdrawable: a first payment still inside its 14-day withdrawal period
 *     (it may come back in part — the days used are kept);
 *   - settled: renewals, first payments past their deadline, and the share a
 *     withdrawal kept for the days used;
 *   - refunded: what a withdrawal gave back (or is giving back).
 * Amounts are integer minor units; a single currency is assumed (the first
 * met), rows in another are left out and counted.
 */

export interface StudioInvoiceRow {
  stripe_invoice_id: string;
  billing_reason: string;
  status: string;
  amount: number | string;
  currency: string;
  occurred_at: string;
}

export interface StudioWithdrawalRow {
  stripe_invoice_id: string;
  status: string;
  refund_amount: number | string;
  currency: string;
}

export interface StudioRevenueWeek {
  week: string;
  settled: number;
  withdrawable: number;
  refunded: number;
}

export interface StudioRevenueFigures {
  currency: string | null;
  received: number;
  settled: number;
  withdrawable: number;
  refunded: number;
  /** All periods: money still inside a withdrawal period today, and when the next of it settles. */
  withdrawableNow: number;
  nextSettlement: string | null;
  weeks: StudioRevenueWeek[];
  /** Rows left out because of another currency. */
  skipped: number;
}

/** A withdrawal that gives money back (pending or done); a failed refund or none gives nothing. */
const GIVES_BACK = new Set(["requested", "refund_pending", "refunded"]);

const PARIS_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const PARIS_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: SHOP_TIME_ZONE, hour: "2-digit", hourCycle: "h23" });

/**
 * End of the 14th day after a payment, Paris time — the same instant as
 * `private.studio_withdrawal_terms()` (the Paris date + 15 days, at midnight).
 */
export function withdrawalDeadline(paidAt: string): number {
  const [y, m, d] = PARIS_DATE.format(new Date(paidAt)).split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d + 15);
  // Paris is UTC+1 or UTC+2: its clock at that UTC midnight gives the offset.
  const offsetHours = Number(PARIS_HOUR.format(new Date(utcMidnight)));
  return utcMidnight - offsetHours * 3_600_000;
}

/** Monday of the week of an instant, `YYYY-MM-DD` in UTC (as the trial panel groups). */
function weekOf(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

export function buildStudioRevenueFigures(
  invoices: StudioInvoiceRow[],
  withdrawals: StudioWithdrawalRow[],
  range: { start: Date; end: Date },
  now: Date,
): StudioRevenueFigures {
  const nowMs = now.getTime();
  const paid = invoices.filter((invoice) => invoice.status === "paid");
  const currency = paid[0]?.currency ?? null;
  const refundOf = new Map<string, number>();
  for (const w of withdrawals) {
    if (GIVES_BACK.has(w.status) && w.currency === currency) refundOf.set(w.stripe_invoice_id, toMinorUnits(w.refund_amount));
  }

  const figures: StudioRevenueFigures = {
    currency,
    received: 0,
    settled: 0,
    withdrawable: 0,
    refunded: 0,
    withdrawableNow: 0,
    nextSettlement: null,
    weeks: [],
    skipped: 0,
  };
  const weeks = new Map<string, StudioRevenueWeek>();
  let next: number | null = null;

  for (const invoice of paid) {
    if (invoice.currency !== currency) {
      figures.skipped += 1;
      continue;
    }
    const amount = toMinorUnits(invoice.amount);
    const at = Date.parse(invoice.occurred_at);
    const refunded = Math.min(amount, refundOf.get(invoice.stripe_invoice_id) ?? 0);
    const open = invoice.billing_reason === "subscription_create" && !refundOf.has(invoice.stripe_invoice_id) && nowMs < withdrawalDeadline(invoice.occurred_at);
    const withdrawable = open ? amount : 0;
    const settled = amount - refunded - withdrawable;

    if (open) {
      figures.withdrawableNow += amount;
      const deadline = withdrawalDeadline(invoice.occurred_at);
      if (next === null || deadline < next) next = deadline;
    }
    if (at < range.start.getTime() || at >= range.end.getTime()) continue;

    figures.received += amount;
    figures.settled += settled;
    figures.withdrawable += withdrawable;
    figures.refunded += refunded;
    const week = weekOf(at);
    const row = weeks.get(week) ?? { week, settled: 0, withdrawable: 0, refunded: 0 };
    row.settled += settled;
    row.withdrawable += withdrawable;
    row.refunded += refunded;
    weeks.set(week, row);
  }

  figures.nextSettlement = next === null ? null : new Date(next).toISOString();
  figures.weeks = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
  return figures;
}

/* ----------------------------------------------------------------- the read */

const PAGE_ROWS = 1000;

async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await query(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return rows;
  }
}

export type StudioRevenueState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; figures: StudioRevenueFigures };

/** The figures for the page's period; re-read when the period changes. */
export function useStudioRevenueFigures(period: Period | null, reloadKey: unknown): StudioRevenueState {
  const [state, setState] = useState<{ key: string; value: StudioRevenueState } | null>(null);
  const key = period ? `${period.from}/${period.to}` : "";

  useEffect(() => {
    if (!period || !isSupabaseConfigured) return;
    const controller = new AbortController();
    const client = requireSupabase();
    const range = periodInstants(period, SHOP_TIME_ZONE);
    Promise.all([
      readAll<StudioInvoiceRow>((from, to) =>
        client
          .from("studio_subscription_invoices")
          .select("stripe_invoice_id, billing_reason, status, amount, currency, occurred_at")
          .order("stripe_invoice_id", { ascending: true })
          .range(from, to)
          .abortSignal(controller.signal),
      ),
      readAll<StudioWithdrawalRow>((from, to) =>
        client
          .from("studio_withdrawals")
          .select("stripe_invoice_id, status, refund_amount, currency")
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(controller.signal),
      ),
    ])
      .then(([invoices, withdrawals]) =>
        setState({ key, value: { kind: "ready", figures: buildStudioRevenueFigures(invoices, withdrawals, range, new Date()) } }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, value: { kind: "error" } });
      });
    return () => controller.abort();
    // `period` is described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadKey]);

  if (!isSupabaseConfigured) return { kind: "unavailable" };
  return state && state.key === key ? state.value : { kind: "loading" };
}
