/**
 * Row ↔ UI shapes of the shop's online withdrawal function (decision 131).
 * The database decides everything (period, lines, quantities, sealed products,
 * consumer status): this module only reads its answer and builds the request.
 * Pure: no React, no Supabase.
 */

export type WithdrawalClosedReason = "not_paid" | "professional" | "deadline_passed" | "nothing_left";
export type WithdrawalLineExclusion = "course" | "gift_card" | "digital";
export type WithdrawalStatus = "declared" | "return_received" | "refunded" | "refused";
export type WithdrawalRefusalReason =
  | "deadline_passed"
  | "unsealed_hygiene"
  | "professional_buyer"
  | "goods_not_returned"
  | "goods_damaged"
  | "other";

export const WITHDRAWAL_REFUSAL_REASONS: readonly WithdrawalRefusalReason[] = [
  "deadline_passed",
  "unsealed_hygiene",
  "professional_buyer",
  "goods_not_returned",
  "goods_damaged",
  "other",
];

export interface WithdrawalLine {
  orderItemId: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  /** Units the customer can still withdraw (0 when excluded or already taken back). */
  withdrawable: number;
  excluded: WithdrawalLineExclusion | null;
  /** Sealed product for the mouth: the customer says whether the seal was opened. */
  hygieneSeal: boolean;
}

export interface DeclaredWithdrawal {
  id: string;
  status: WithdrawalStatus;
  customerName: string;
  channel: "account" | "email_link";
  declaredAt: string;
  deadlineAt: string | null;
  returnReceivedAt: string | null;
  refundedAt: string | null;
  refusedAt: string | null;
  refusalReason: WithdrawalRefusalReason | null;
  refusalNote: string | null;
  /** The latest refund linked to it, as Stripe left it (pending until confirmed). */
  refundStatus: "pending" | "succeeded" | "failed" | "cancelled" | null;
  items: { orderItemId: string; productName: string; variantName: string | null; quantity: number }[];
  /** Staff only: the lines' paid value (+ delivery when everything comes back), minor units. */
  suggestedRefundMinor?: number;
  refundId?: string | null;
}

export interface WithdrawalOptions {
  orderId: string;
  orderNumber: string;
  open: boolean;
  reason: WithdrawalClosedReason | null;
  receivedAt: string | null;
  deadlineAt: string | null;
  lines: WithdrawalLine[];
  withdrawals: DeclaredWithdrawal[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : Number.parseInt(String(v ?? "0"), 10) || 0);
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | null =>
  typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : null;

/** "35.00" (numeric as Postgres returns it) → 3500, without floating-point arithmetic. */
export function decimalToMinor(value: unknown): number {
  const raw = typeof value === "number" ? value.toFixed(2) : String(value ?? "0");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?/.exec(raw.trim());
  if (!match) return 0;
  const minor = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] === "-" ? -minor : minor;
}

function readWithdrawal(raw: unknown): DeclaredWithdrawal | null {
  if (!isRecord(raw) || !text(raw.id)) return null;
  const status = oneOf(raw.status, ["declared", "return_received", "refunded", "refused"] as const);
  if (!status) return null;
  return {
    id: String(raw.id),
    status,
    customerName: text(raw.customer_name) ?? "",
    channel: raw.channel === "email_link" ? "email_link" : "account",
    declaredAt: text(raw.declared_at) ?? "",
    deadlineAt: text(raw.deadline_at),
    returnReceivedAt: text(raw.return_received_at),
    refundedAt: text(raw.refunded_at),
    refusedAt: text(raw.refused_at),
    refusalReason: oneOf(raw.refusal_reason, WITHDRAWAL_REFUSAL_REASONS),
    refusalNote: text(raw.refusal_note),
    refundStatus: oneOf(raw.refund_status, ["pending", "succeeded", "failed", "cancelled"] as const),
    items: Array.isArray(raw.items)
      ? raw.items.filter(isRecord).map((item) => ({
        orderItemId: String(item.order_item_id ?? ""),
        productName: text(item.product_name) ?? "",
        variantName: text(item.variant_name),
        quantity: int(item.quantity),
      }))
      : [],
    ...("suggested_refund" in raw ? { suggestedRefundMinor: decimalToMinor(raw.suggested_refund) } : {}),
    ...("refund_id" in raw ? { refundId: text(raw.refund_id) } : {}),
  };
}

/** The database's overview, or null when it is not one. */
export function readWithdrawalOptions(raw: unknown): WithdrawalOptions | null {
  if (!isRecord(raw) || !text(raw.order_id)) return null;
  const lines: WithdrawalLine[] = Array.isArray(raw.lines)
    ? raw.lines.filter(isRecord).map((line) => ({
      orderItemId: String(line.order_item_id ?? ""),
      productName: text(line.product_name) ?? "",
      variantName: text(line.variant_name),
      quantity: int(line.quantity),
      withdrawable: Math.max(0, int(line.withdrawable)),
      excluded: oneOf(line.excluded, ["course", "gift_card", "digital"] as const),
      hygieneSeal: line.hygiene_seal === true,
    }))
    : [];
  return {
    orderId: String(raw.order_id),
    orderNumber: text(raw.order_number) ?? "",
    open: raw.open === true,
    reason: oneOf(raw.reason, ["not_paid", "professional", "deadline_passed", "nothing_left"] as const),
    receivedAt: text(raw.received_at),
    deadlineAt: text(raw.deadline_at),
    lines,
    withdrawals: Array.isArray(raw.withdrawals)
      ? raw.withdrawals.map(readWithdrawal).filter((w): w is DeclaredWithdrawal => w !== null)
      : [],
  };
}

/** The customer's choice for one line: how many units, and the seal answer when asked. */
export interface LineChoice {
  quantity: number;
  /** null: not answered yet (required for a sealed product). */
  sealOpened: boolean | null;
}

export type ChoiceProblem = "nothing_selected" | "seal_answer_required" | "unsealed_hygiene" | "quantity";

/** What stops the declaration in the browser (the database checks again). */
export function choiceProblem(lines: WithdrawalLine[], choices: Record<string, LineChoice>): ChoiceProblem | null {
  const chosen = lines.filter((line) => (choices[line.orderItemId]?.quantity ?? 0) > 0);
  if (chosen.length === 0) return "nothing_selected";
  for (const line of chosen) {
    const choice = choices[line.orderItemId];
    if (line.excluded || choice.quantity > line.withdrawable) return "quantity";
    if (line.hygieneSeal && choice.sealOpened === null) return "seal_answer_required";
    if (line.hygieneSeal && choice.sealOpened) return "unsealed_hygiene";
  }
  return null;
}

export function itemsPayload(lines: WithdrawalLine[], choices: Record<string, LineChoice>) {
  return lines
    .filter((line) => (choices[line.orderItemId]?.quantity ?? 0) > 0)
    .map((line) => {
      const choice = choices[line.orderItemId];
      return {
        order_item_id: line.orderItemId,
        quantity: choice.quantity,
        ...(line.hygieneSeal ? { seal_opened: choice.sealOpened === true } : {}),
      };
    });
}

export const DECLARE_ERRORS = [
  "not_paid",
  "professional",
  "deadline_passed",
  "professional_buyer",
  "excluded_line",
  "unsealed_hygiene",
  "quantity",
  "seal_answer_required",
  "not_allowed",
  "link_invalid",
  "sign_in_required",
  "session_expired",
  "invalid_request",
  "rate_limited",
  "captcha_required",
  "captcha_failed",
] as const;
export type DeclareError = (typeof DECLARE_ERRORS)[number] | "unavailable";

/** A function's `{error}` code as one the page explains. */
export function readDeclareError(code: unknown): DeclareError {
  return oneOf(code, DECLARE_ERRORS) ?? "unavailable";
}
