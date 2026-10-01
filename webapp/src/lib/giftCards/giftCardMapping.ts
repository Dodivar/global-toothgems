import { toMinorUnits } from "../catalog/money";
import type { Tables, TablesUpdate } from "../supabase/database.types";

/**
 * Gift cards: rows ↔ UI shapes, pure and unit-tested.
 *
 * Money crosses here only (AGENTS.md §8): Postgres `numeric(12,2)` (a JSON
 * number or string) becomes integer minor units, and minor units go back as
 * exact decimal strings. Statuses are the database's (`gift_card_overview.
 * display_status`), never recomputed from dates in the browser. The code is
 * a bearer credential: nothing here ever holds more than its last 4 characters.
 */

export const GIFT_CARD_DESIGNS = ["sparkle", "blush", "noir", "mint", "photo"] as const;
export type GiftCardDesign = (typeof GIFT_CARD_DESIGNS)[number];
export type FieldMode = "required" | "optional" | "hidden";
const FIELD_MODES: readonly FieldMode[] = ["required", "optional", "hidden"];

/** The storefront product configuration (`gift_card_settings`), money in minor units. */
export interface GiftCardConfig {
  productId: string | null;
  currency: string;
  /** Ordered: the order of the amount buttons on the storefront. */
  amounts: number[];
  allowCustomAmount: boolean;
  minMinor: number;
  maxMinor: number;
  /** Null: cards never expire. */
  expiryMonths: number | null;
  allowScheduledDelivery: boolean;
  fields: { recipientName: FieldMode; senderName: FieldMode; message: FieldMode };
  messageMaxLength: number;
  designs: GiftCardDesign[];
  defaultDesign: GiftCardDesign;
  published: boolean;
}

type SettingsRow = Tables<"gift_card_settings">;

const asDesign = (value: string): GiftCardDesign | null =>
  (GIFT_CARD_DESIGNS as readonly string[]).includes(value) ? (value as GiftCardDesign) : null;
const asMode = (value: string): FieldMode => ((FIELD_MODES as readonly string[]).includes(value) ? (value as FieldMode) : "optional");

export function mapSettingsRow(row: SettingsRow): GiftCardConfig {
  const designs = row.enabled_designs.map(asDesign).filter((d): d is GiftCardDesign => d !== null);
  return {
    productId: row.product_id,
    currency: row.currency,
    amounts: row.preset_amounts.map((a) => toMinorUnits(a)),
    allowCustomAmount: row.allow_custom_amount,
    minMinor: toMinorUnits(row.min_amount),
    maxMinor: toMinorUnits(row.max_amount),
    expiryMonths: row.expiry_months,
    allowScheduledDelivery: row.allow_scheduled_delivery,
    fields: {
      recipientName: asMode(row.recipient_name_mode),
      senderName: asMode(row.sender_name_mode),
      message: asMode(row.message_mode),
    },
    messageMaxLength: row.message_max_length,
    designs,
    defaultDesign: asDesign(row.default_design) ?? designs[0] ?? "sparkle",
    published: row.is_published,
  };
}

/** `1234` → `"12.34"`, `-550` → `"-5.50"`: the exact decimal a `numeric` argument receives. */
export function minorToDecimal(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error(`Invalid minor amount: ${minor}`);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * The settings row to write. Amounts go as decimal strings (PostgREST hands
 * them to `numeric`), never as floats; the database checks the bounds again.
 */
export function settingsUpdate(config: GiftCardConfig): TablesUpdate<"gift_card_settings"> {
  return {
    preset_amounts: config.amounts.map(minorToDecimal) as unknown as number[],
    allow_custom_amount: config.allowCustomAmount,
    min_amount: minorToDecimal(config.minMinor) as unknown as number,
    max_amount: minorToDecimal(config.maxMinor) as unknown as number,
    expiry_months: config.expiryMonths,
    allow_scheduled_delivery: config.allowScheduledDelivery,
    recipient_name_mode: config.fields.recipientName,
    sender_name_mode: config.fields.senderName,
    message_mode: config.fields.message,
    message_max_length: config.messageMaxLength,
    enabled_designs: config.designs,
    default_design: config.defaultDesign,
    is_published: config.published,
  };
}

export type ConfigIssue = "noAmount" | "invalidAmount" | "minMax" | "noDesign" | "defaultDisabled";

/** What stops a save, in the order the form shows it (the database refuses the same things). */
export function configIssues(config: GiftCardConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (config.amounts.length === 0) issues.push("noAmount");
  if (config.amounts.some((a) => !Number.isSafeInteger(a) || a <= 0) || config.minMinor <= 0) issues.push("invalidAmount");
  if (config.maxMinor < config.minMinor) issues.push("minMax");
  if (config.designs.length === 0) issues.push("noDesign");
  else if (!config.designs.includes(config.defaultDesign)) issues.push("defaultDisabled");
  return issues;
}

/** Whether a storefront amount is one the database will accept (presets, or the custom range). */
export function isAllowedAmount(config: GiftCardConfig, minor: number): boolean {
  if (!Number.isSafeInteger(minor) || minor <= 0) return false;
  return config.amounts.includes(minor) || (config.allowCustomAmount && minor >= config.minMinor && minor <= config.maxMinor);
}

/* -------------------------------------------------------------------------- */
/* Back office                                                                 */
/* -------------------------------------------------------------------------- */

export type GiftCardStatus =
  | "active"
  | "partiallyRedeemed"
  | "redeemed"
  | "scheduled"
  | "expired"
  | "cancelled"
  | "pendingPayment"
  | "void";
export const GIFT_CARD_STATUSES: GiftCardStatus[] = [
  "active",
  "partiallyRedeemed",
  "redeemed",
  "scheduled",
  "expired",
  "cancelled",
  "pendingPayment",
  "void",
];
const STATUS_FROM_DB: Record<string, GiftCardStatus> = {
  active: "active",
  partially_redeemed: "partiallyRedeemed",
  redeemed: "redeemed",
  scheduled: "scheduled",
  expired: "expired",
  cancelled: "cancelled",
  pending_payment: "pendingPayment",
  void: "void",
};

export type DeliveryStatus = "pending" | "scheduled" | "sent" | "delivered" | "opened" | "bounced";
export const DELIVERY_STATUSES: DeliveryStatus[] = ["pending", "scheduled", "sent", "delivered", "opened", "bounced"];

export interface AdminGiftCard {
  id: string;
  /** Last 4 characters of the code; the rest never leaves the database. */
  last4: string;
  source: "purchase" | "manual";
  currency: string;
  initialMinor: number;
  balanceMinor: number;
  status: GiftCardStatus;
  delivery: DeliveryStatus;
  recipientName: string | null;
  recipientEmail: string;
  senderName: string | null;
  purchaserEmail: string | null;
  orderId: string | null;
  orderNumber: string | null;
  design: GiftCardDesign;
  deliverAt: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

type OverviewRow = Tables<"gift_card_overview">;

/** Null for a row the view could not describe (it never happens with the current view, but the types allow it). */
export function mapOverviewRow(row: OverviewRow, orderNumbers: ReadonlyMap<string, string>): AdminGiftCard | null {
  if (!row.id || !row.code_last4 || row.initial_amount === null || row.balance === null || !row.created_at) return null;
  return {
    id: row.id,
    last4: row.code_last4,
    source: row.source === "manual" ? "manual" : "purchase",
    currency: row.currency ?? "EUR",
    initialMinor: toMinorUnits(row.initial_amount),
    balanceMinor: toMinorUnits(row.balance),
    status: STATUS_FROM_DB[row.display_status ?? ""] ?? "void",
    delivery: (DELIVERY_STATUSES as readonly string[]).includes(row.delivery_status ?? "")
      ? (row.delivery_status as DeliveryStatus)
      : "pending",
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email ?? "",
    senderName: row.sender_name,
    purchaserEmail: row.purchaser_email,
    orderId: row.order_id,
    orderNumber: row.order_id ? (orderNumbers.get(row.order_id) ?? null) : null,
    design: asDesign(row.design ?? "") ?? "sparkle",
    deliverAt: row.deliver_at,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
  };
}

/** The back-office address of a card: its id, never its code. */
export const giftCardAdminPath = (card: Pick<AdminGiftCard, "id">) => `/admin/promotions/cartes-cadeaux/${card.id}`;

/** Masked code for display: `•••• 7K2M`. */
export const maskedCode = (last4: string) => `•••• ${last4}`;

export type LedgerKind =
  | "purchase"
  | "issue"
  | "redemption"
  | "reversal"
  | "refund"
  | "adjustment"
  | "extension"
  | "cancellation"
  | "resend";
const LEDGER_KINDS: readonly LedgerKind[] = [
  "purchase",
  "issue",
  "redemption",
  "reversal",
  "refund",
  "adjustment",
  "extension",
  "cancellation",
  "resend",
];

export interface GiftCardTransaction {
  id: number;
  kind: LedgerKind;
  /** Signed: + credits the card, − spends it. */
  amountMinor: number;
  balanceAfterMinor: number;
  at: string;
  actorName: string | null;
  orderId: string | null;
  orderNumber: string | null;
  note: string | null;
}

type LedgerRow = Pick<Tables<"gift_card_transactions">, "id" | "kind" | "amount" | "balance_after" | "created_at" | "actor_id" | "order_id" | "note">;

/** The ledger oldest first, as the database recorded it (balance after each line included). */
export function mapLedger(
  rows: LedgerRow[],
  actors: ReadonlyMap<string, string>,
  orderNumbers: ReadonlyMap<string, string>,
): GiftCardTransaction[] {
  return rows
    .filter((row) => (LEDGER_KINDS as readonly string[]).includes(row.kind))
    .map((row) => ({
      id: row.id,
      kind: row.kind as LedgerKind,
      amountMinor: toMinorUnits(row.amount),
      balanceAfterMinor: toMinorUnits(row.balance_after),
      at: row.created_at,
      actorName: row.actor_id ? (actors.get(row.actor_id) ?? null) : null,
      orderId: row.order_id,
      orderNumber: row.order_id ? (orderNumbers.get(row.order_id) ?? null) : null,
      note: row.note,
    }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id);
}

export interface GiftCardMetrics {
  /** Cards that exist as value: issued by staff or paid by a customer. */
  issued: number;
  /** Face value of the cards customers paid for. */
  soldMinor: number;
  /** What is still owed on usable cards (a liability). */
  outstandingMinor: number;
  expired: number;
  expiredMinor: number;
}

/** Per currency of the shop (one currency, decision 35): cards in another currency are left out. */
export function giftCardMetrics(cards: AdminGiftCard[], currency: string): GiftCardMetrics {
  const live = cards.filter((c) => c.currency === currency && c.status !== "pendingPayment" && c.status !== "void");
  const expired = live.filter((c) => c.status === "expired");
  return {
    issued: live.length,
    soldMinor: live.filter((c) => c.source === "purchase").reduce((sum, c) => sum + c.initialMinor, 0),
    outstandingMinor: live
      .filter((c) => c.status === "active" || c.status === "partiallyRedeemed" || c.status === "scheduled")
      .reduce((sum, c) => sum + c.balanceMinor, 0),
    expired: expired.length,
    expiredMinor: expired.reduce((sum, c) => sum + c.balanceMinor, 0),
  };
}

export type GiftCardSort = "newest" | "balance" | "expiry";
export interface GiftCardFilters {
  query: string;
  status: GiftCardStatus | "all";
  delivery: DeliveryStatus | "all";
  sort: GiftCardSort;
}
export const EMPTY_GIFT_CARD_FILTERS: GiftCardFilters = { query: "", status: "all", delivery: "all", sort: "newest" };

export function filterGiftCards(cards: AdminGiftCard[], f: GiftCardFilters): AdminGiftCard[] {
  const q = f.query.trim().toLowerCase().replace(/[\s•-]/g, "");
  return cards
    .filter((c) => {
      if (f.status !== "all" && c.status !== f.status) return false;
      if (f.delivery !== "all" && c.delivery !== f.delivery) return false;
      if (!q) return true;
      const hay = [c.last4, c.recipientName, c.recipientEmail, c.senderName, c.purchaserEmail, c.orderNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[\s-]/g, "");
      return hay.includes(q);
    })
    .sort((a, b) => {
      if (f.sort === "balance") return b.balanceMinor - a.balanceMinor;
      if (f.sort === "expiry") return (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999");
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/** Which staff actions the card's state allows (the database checks again). */
export function cardActions(card: Pick<AdminGiftCard, "status" | "expiresAt">) {
  const usable = card.status !== "cancelled" && card.status !== "pendingPayment" && card.status !== "void";
  return {
    adjust: usable,
    extend: usable && card.expiresAt !== null,
    cancel: usable,
  };
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export type GiftCardWriteError = "forbidden" | "noteRequired" | "insufficient" | "notActive" | "invalid" | "network" | "unknown";

/** A refused RPC → the reason the screen words. SQL messages are never shown. */
export function writeErrorOf(error: { code?: string; message?: string } | null | undefined): GiftCardWriteError {
  if (!error) return "unknown";
  const message = error.message ?? "";
  if (error.code === "42501") return "forbidden";
  if (/balance insufficient/.test(message)) return "insufficient";
  if (/note is required/.test(message)) return "noteRequired";
  if (error.code === "23514" || /only active cards|never expires/.test(message)) return "notActive";
  if (error.code === "22023" || error.code === "22P02" || error.code === "P0002" || error.code === "23502") return "invalid";
  if (/fetch|network/i.test(message)) return "network";
  return "unknown";
}

/* -------------------------------------------------------------------------- */
/* Storefront and cart                                                          */
/* -------------------------------------------------------------------------- */

/** Same shape the checkout function accepts (`_shared/checkoutInput.ts`). */
export const GIFT_CARD_CODE_RE = /^GT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
export const MAX_GIFT_CARD_CODES = 5;

/** What a customer types → the canonical code, or null when it cannot be one. Spaces and missing dashes are forgiven. */
export function normalizeGiftCardCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, "");
  if (!/^GT[A-Z0-9]{12}$/.test(compact)) return null;
  const code = `GT-${compact.slice(2, 6)}-${compact.slice(6, 10)}-${compact.slice(10, 14)}`;
  return GIFT_CARD_CODE_RE.test(code) ? code : null;
}

export type AddCodeResult = { ok: true; codes: string[] } | { ok: false; reason: "format" | "duplicate" | "limit" };

export function addGiftCardCode(codes: string[], input: string): AddCodeResult {
  const code = normalizeGiftCardCode(input);
  if (!code) return { ok: false, reason: "format" };
  if (codes.includes(code)) return { ok: false, reason: "duplicate" };
  if (codes.length >= MAX_GIFT_CARD_CODES) return { ok: false, reason: "limit" };
  return { ok: true, codes: [...codes, code] };
}

/**
 * A typed amount ("25", "25,5", "1 250.00") → minor units, read digit by digit
 * (no float). Null for anything else, more than two decimals included: the
 * database would refuse it rather than round it.
 */
export function parseAmountInput(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, "").replace(",", ".");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Minor units → what an amount field shows ("25", "25.5"). */
export function amountToInput(minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, "0").replace(/0$/, "")}`;
}

/** A calendar day (yyyy-mm-dd, the staff member's day) → the end of that day as an ISO instant. */
export function endOfDayIso(day: string): string {
  return new Date(`${day}T23:59:59`).toISOString();
}
