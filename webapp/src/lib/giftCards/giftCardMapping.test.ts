import { describe, expect, it } from "vitest";
import type { Tables } from "../supabase/database.types";
import {
  addGiftCardCode,
  amountToInput,
  cardActions,
  configIssues,
  filterGiftCards,
  giftCardMetrics,
  isAllowedAmount,
  mapLedger,
  mapOverviewRow,
  mapSettingsRow,
  minorToDecimal,
  normalizeGiftCardCode,
  parseAmountInput,
  settingsUpdate,
  writeErrorOf,
  EMPTY_GIFT_CARD_FILTERS,
  type AdminGiftCard,
} from "./giftCardMapping";

const settingsRow: Tables<"gift_card_settings"> = {
  id: true,
  product_id: "0b5e6a52-7d0c-4a55-9d7e-1f6f6b2c1a01",
  currency: "EUR",
  preset_amounts: [25, 50, 75.5],
  allow_custom_amount: true,
  min_amount: 15,
  max_amount: 500,
  expiry_months: 12,
  allow_scheduled_delivery: true,
  recipient_name_mode: "required",
  sender_name_mode: "optional",
  message_mode: "hidden",
  message_max_length: 240,
  enabled_designs: ["sparkle", "noir", "gold"],
  default_design: "noir",
  is_published: true,
  updated_at: "2026-10-01T10:00:00Z",
  updated_by: null,
};

const overviewRow: Tables<"gift_card_overview"> = {
  id: "c1",
  code_last4: "Q9XA",
  source: "purchase",
  currency: "EUR",
  initial_amount: 100,
  balance: 45.5,
  order_id: "o1",
  purchaser_user_id: null,
  purchaser_email: "manon@example.fr",
  recipient_name: "Jade",
  recipient_email: "jade@example.fr",
  sender_name: "Manon",
  design: "blush",
  deliver_at: null,
  delivery_status: "pending",
  issued_at: "2026-09-02T10:00:00Z",
  expires_at: "2027-09-02T10:00:00Z",
  cancelled_at: null,
  created_at: "2026-09-02T09:58:00Z",
  display_status: "partially_redeemed",
};

const card = (patch: Partial<AdminGiftCard>): AdminGiftCard => ({ ...mapOverviewRow(overviewRow, new Map())!, ...patch });

describe("gift card settings", () => {
  it("reads money as integer minor units and drops unknown designs", () => {
    const config = mapSettingsRow(settingsRow);
    expect(config.amounts).toEqual([2500, 5000, 7550]);
    expect([config.minMinor, config.maxMinor]).toEqual([1500, 50000]);
    expect(config.designs).toEqual(["sparkle", "noir"]);
    expect(config.defaultDesign).toBe("noir");
    expect(config.fields).toEqual({ recipientName: "required", senderName: "optional", message: "hidden" });
  });

  it("writes exact decimal strings, never floats", () => {
    const update = settingsUpdate(mapSettingsRow(settingsRow));
    expect(update.preset_amounts).toEqual(["25.00", "50.00", "75.50"]);
    expect(update.min_amount).toBe("15.00");
    expect(update.enabled_designs).toEqual(["sparkle", "noir"]);
    expect(update).not.toHaveProperty("id");
    expect(update).not.toHaveProperty("product_id");
  });

  it("lists what the database would refuse", () => {
    const config = mapSettingsRow(settingsRow);
    expect(configIssues(config)).toEqual([]);
    expect(configIssues({ ...config, amounts: [] })).toEqual(["noAmount"]);
    expect(configIssues({ ...config, maxMinor: 1000 })).toEqual(["minMax"]);
    expect(configIssues({ ...config, designs: [] })).toEqual(["noDesign"]);
    expect(configIssues({ ...config, defaultDesign: "mint" })).toEqual(["defaultDisabled"]);
  });

  it("accepts presets or the custom range only", () => {
    const config = mapSettingsRow(settingsRow);
    expect(isAllowedAmount(config, 7550)).toBe(true);
    expect(isAllowedAmount(config, 1500)).toBe(true);
    expect(isAllowedAmount(config, 1499)).toBe(false);
    expect(isAllowedAmount({ ...config, allowCustomAmount: false }, 3000)).toBe(false);
    expect(isAllowedAmount(config, 12.5)).toBe(false);
  });
});

describe("money at the boundary", () => {
  it("formats signed minor units exactly", () => {
    expect(minorToDecimal(1234)).toBe("12.34");
    expect(minorToDecimal(-550)).toBe("-5.50");
    expect(minorToDecimal(5)).toBe("0.05");
    expect(() => minorToDecimal(1.5)).toThrow();
  });

  it("parses typed amounts digit by digit and refuses sub-cents", () => {
    expect(parseAmountInput("25")).toBe(2500);
    expect(parseAmountInput("25,5")).toBe(2550);
    expect(parseAmountInput(" 1 250.05 ")).toBe(125005);
    expect(parseAmountInput("0.1")).toBe(10);
    for (const bad of ["", "abc", "10.005", "-5", "1e3", "12.", ".5"]) expect(parseAmountInput(bad), bad).toBeNull();
    expect(amountToInput(2550)).toBe("25.5");
    expect(amountToInput(2500)).toBe("25");
    expect(amountToInput(2505)).toBe("25.05");
  });
});

describe("back-office cards", () => {
  it("maps the overview with the database's status and the last 4 only", () => {
    const mapped = mapOverviewRow(overviewRow, new Map([["o1", "GT-100231"]]))!;
    expect(mapped).toMatchObject({ last4: "Q9XA", status: "partiallyRedeemed", initialMinor: 10000, balanceMinor: 4550, orderNumber: "GT-100231", delivery: "pending" });
    expect(JSON.stringify(mapped)).not.toMatch(/GT-[A-Z0-9]{4}-/);
    expect(mapOverviewRow({ ...overviewRow, display_status: "pending_payment" }, new Map())!.status).toBe("pendingPayment");
    expect(mapOverviewRow({ ...overviewRow, id: null }, new Map())).toBeNull();
  });

  it("orders the ledger and names actors and orders", () => {
    const ledger = mapLedger(
      [
        { id: 2, kind: "redemption", amount: -54.5, balance_after: 45.5, created_at: "2026-09-10T10:00:00Z", actor_id: null, order_id: "o2", note: null },
        { id: 1, kind: "purchase", amount: 100, balance_after: 100, created_at: "2026-09-02T10:00:00Z", actor_id: "u1", order_id: "o1", note: "Achat" },
        { id: 3, kind: "mystery", amount: 1, balance_after: 1, created_at: "2026-09-11T10:00:00Z", actor_id: null, order_id: null, note: null },
      ],
      new Map([["u1", "Camille Dubois"]]),
      new Map([["o2", "GT-100300"]]),
    );
    expect(ledger.map((tx) => [tx.kind, tx.amountMinor, tx.balanceAfterMinor])).toEqual([
      ["purchase", 10000, 10000],
      ["redemption", -5450, 4550],
    ]);
    expect(ledger[0].actorName).toBe("Camille Dubois");
    expect(ledger[1].orderNumber).toBe("GT-100300");
  });

  it("counts what is owed, never cards awaiting payment", () => {
    const cards = [
      card({ id: "a", status: "active", balanceMinor: 5000, initialMinor: 5000 }),
      card({ id: "b", status: "partiallyRedeemed", balanceMinor: 1000, initialMinor: 3000, source: "manual" }),
      card({ id: "c", status: "expired", balanceMinor: 2000, initialMinor: 2000 }),
      card({ id: "d", status: "pendingPayment", balanceMinor: 0, initialMinor: 9900 }),
      card({ id: "e", status: "active", balanceMinor: 700, initialMinor: 700, currency: "GBP" }),
    ];
    expect(giftCardMetrics(cards, "EUR")).toEqual({ issued: 3, soldMinor: 7000, outstandingMinor: 6000, expired: 1, expiredMinor: 2000 });
  });

  it("filters by last 4, people and order, and sorts", () => {
    const cards = [
      card({ id: "a", last4: "AAAA", recipientName: "Léa", balanceMinor: 100, createdAt: "2026-01-01" }),
      card({ id: "b", last4: "BBBB", recipientName: "Jade", balanceMinor: 900, orderNumber: "GT-100777", createdAt: "2026-02-01" }),
    ];
    expect(filterGiftCards(cards, { ...EMPTY_GIFT_CARD_FILTERS, query: "•••• bbbb" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterGiftCards(cards, { ...EMPTY_GIFT_CARD_FILTERS, query: "100777" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterGiftCards(cards, EMPTY_GIFT_CARD_FILTERS).map((c) => c.id)).toEqual(["b", "a"]);
    expect(filterGiftCards(cards, { ...EMPTY_GIFT_CARD_FILTERS, sort: "balance" }).map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("offers actions the database would allow", () => {
    expect(cardActions({ status: "active", expiresAt: "2027-01-01" })).toEqual({ adjust: true, extend: true, cancel: true });
    expect(cardActions({ status: "active", expiresAt: null }).extend).toBe(false);
    for (const status of ["cancelled", "pendingPayment", "void"] as const) {
      expect(cardActions({ status, expiresAt: "2027-01-01" })).toEqual({ adjust: false, extend: false, cancel: false });
    }
  });

  it("words refusals without SQL", () => {
    expect(writeErrorOf({ code: "42501", message: "issue_gift_card: not allowed" })).toBe("forbidden");
    expect(writeErrorOf({ code: "P0001", message: "gift card balance insufficient" })).toBe("insufficient");
    expect(writeErrorOf({ code: "22023", message: "adjust_gift_card: a note is required" })).toBe("noteRequired");
    expect(writeErrorOf({ code: "23514", message: "only active cards can be adjusted" })).toBe("notActive");
    expect(writeErrorOf({ code: "22023", message: "issue_gift_card: invalid recipient email" })).toBe("invalid");
    expect(writeErrorOf({ message: "TypeError: Failed to fetch" })).toBe("network");
  });
});

describe("codes typed in the cart", () => {
  it("normalises spacing, case and dashes", () => {
    expect(normalizeGiftCardCode(" gt-abcd-efgh-jkmn ")).toBe("GT-ABCD-EFGH-JKMN");
    expect(normalizeGiftCardCode("GTABCDEFGHJKMN")).toBe("GT-ABCD-EFGH-JKMN");
    expect(normalizeGiftCardCode("GT ABCD EFGH JKMN")).toBe("GT-ABCD-EFGH-JKMN");
    for (const bad of ["", "GT-ABCD", "XX-ABCD-EFGH-JKMN", "GT-ABCD-EFGH-JKMN-1", "GT-ABÇD-EFGH-JKMN"]) expect(normalizeGiftCardCode(bad), bad).toBeNull();
  });

  it("keeps at most 5 distinct codes", () => {
    let codes: string[] = [];
    for (const c of ["GT-AAAA-AAAA-AAA1", "GT-AAAA-AAAA-AAA2", "GT-AAAA-AAAA-AAA3", "GT-AAAA-AAAA-AAA4", "GT-AAAA-AAAA-AAA5"]) {
      const result = addGiftCardCode(codes, c);
      expect(result.ok).toBe(true);
      if (result.ok) codes = result.codes;
    }
    expect(addGiftCardCode(codes, "GT-AAAA-AAAA-AAA6")).toEqual({ ok: false, reason: "limit" });
    expect(addGiftCardCode(codes.slice(0, 1), "gt-aaaa-aaaa-aaa1")).toEqual({ ok: false, reason: "duplicate" });
    expect(addGiftCardCode([], "nope")).toEqual({ ok: false, reason: "format" });
  });
});
