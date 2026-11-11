import { describe, expect, it } from "vitest";
import {
  choiceProblem,
  decimalToMinor,
  itemsPayload,
  readDeclareError,
  readWithdrawalOptions,
  type WithdrawalLine,
} from "./orderWithdrawalMapping";
import { dateLabel, dateTimeLabel } from "./withdrawalDates";

const OVERVIEW = {
  order_id: "o-1",
  order_number: "GT-100042",
  open: true,
  reason: null,
  received_at: "2026-11-07T10:00:00Z",
  deadline_at: "2026-11-21T23:00:00Z",
  lines: [
    { order_item_id: "a", product_name: "Gem", variant_name: "SS5", quantity: 2, withdrawable: 2, excluded: null, hygiene_seal: true },
    { order_item_id: "b", product_name: "Lamp", variant_name: null, quantity: 1, withdrawable: 1, excluded: null, hygiene_seal: false },
    { order_item_id: "g", product_name: "Gift card", variant_name: null, quantity: 1, withdrawable: 0, excluded: "gift_card", hygiene_seal: false },
  ],
  withdrawals: [
    {
      id: "w-1",
      status: "refused",
      customer_name: "Léa",
      channel: "email_link",
      declared_at: "2026-11-08T09:00:00Z",
      deadline_at: null,
      refusal_reason: "unsealed_hygiene",
      refusal_note: "Opened",
      refund_status: null,
      items: [{ order_item_id: "a", product_name: "Gem", variant_name: "SS5", quantity: 1 }],
      suggested_refund: "35.50",
    },
    { id: "w-2", status: "bogus" },
  ],
};

describe("readWithdrawalOptions", () => {
  it("reads the database's overview and drops what it does not know", () => {
    const options = readWithdrawalOptions(OVERVIEW)!;
    expect(options.open).toBe(true);
    expect(options.lines.map((l) => [l.orderItemId, l.withdrawable, l.excluded, l.hygieneSeal])).toEqual([
      ["a", 2, null, true],
      ["b", 1, null, false],
      ["g", 0, "gift_card", false],
    ]);
    expect(options.withdrawals).toHaveLength(1);
    expect(options.withdrawals[0]).toMatchObject({ status: "refused", channel: "email_link", refusalReason: "unsealed_hygiene", suggestedRefundMinor: 3550 });
  });

  it("returns null for anything else", () => {
    expect(readWithdrawalOptions(null)).toBeNull();
    expect(readWithdrawalOptions({ open: true })).toBeNull();
  });

  it("does not show a suggested refund to customers (absent from their overview)", () => {
    const { suggested_refund: _omit, ...rest } = OVERVIEW.withdrawals[0];
    const options = readWithdrawalOptions({ ...OVERVIEW, withdrawals: [rest] })!;
    expect(options.withdrawals[0].suggestedRefundMinor).toBeUndefined();
  });
});

describe("the declaration", () => {
  const lines = readWithdrawalOptions(OVERVIEW)!.lines as WithdrawalLine[];

  it("needs at least one item, the seal answer, and refuses an opened seal or too many units", () => {
    expect(choiceProblem(lines, {})).toBe("nothing_selected");
    expect(choiceProblem(lines, { a: { quantity: 1, sealOpened: null } })).toBe("seal_answer_required");
    expect(choiceProblem(lines, { a: { quantity: 1, sealOpened: true } })).toBe("unsealed_hygiene");
    expect(choiceProblem(lines, { b: { quantity: 2, sealOpened: null } })).toBe("quantity");
    expect(choiceProblem(lines, { g: { quantity: 1, sealOpened: null } })).toBe("quantity");
    expect(choiceProblem(lines, { a: { quantity: 2, sealOpened: false }, b: { quantity: 1, sealOpened: null } })).toBeNull();
  });

  it("sends the seal answer only for sealed products, and nothing kept", () => {
    expect(itemsPayload(lines, { a: { quantity: 2, sealOpened: false }, b: { quantity: 1, sealOpened: null }, g: { quantity: 0, sealOpened: null } })).toEqual([
      { order_item_id: "a", quantity: 2, seal_opened: false },
      { order_item_id: "b", quantity: 1 },
    ]);
  });

  it("maps unknown error codes to unavailable", () => {
    expect(readDeclareError("deadline_passed")).toBe("deadline_passed");
    expect(readDeclareError("server_error")).toBe("unavailable");
    expect(readDeclareError(undefined)).toBe("unavailable");
  });
});

describe("money and dates", () => {
  it("reads numeric strings without floating point", () => {
    expect(decimalToMinor("35.50")).toBe(3550);
    expect(decimalToMinor("0.1")).toBe(10);
    expect(decimalToMinor(12)).toBe(1200);
    expect(decimalToMinor("x")).toBe(0);
  });

  it("shows the last day of the period (the end is midnight Paris time) and declarations in Paris time", () => {
    expect(dateLabel("2026-11-21T23:00:00Z", "fr")).toBe("21 novembre 2026");
    expect(dateLabel("2026-11-21T23:00:00Z", "en")).toBe("21 November 2026");
    expect(dateTimeLabel("2026-11-09T19:05:00Z", "fr")).toContain("20:05");
  });
});
