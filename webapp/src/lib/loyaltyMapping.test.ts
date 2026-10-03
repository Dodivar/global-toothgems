import { describe, expect, it } from "vitest";
import { DEFAULT_PROGRAMME } from "../data/loyalty";
import { mapOverview, mapProgramme, qualifyingSubtotal, rewardDiscount } from "./loyaltyMapping";

const overview = (over: Partial<Parameters<typeof mapOverview>[0]> = {}) => ({
  current_stamps: 0,
  stamps_required: 5,
  rewards_available: 0,
  cards_redeemed: 0,
  stamps_lifetime: 0,
  ...over,
});

describe("mapProgramme", () => {
  it("reads the stored rules, numeric amounts included", () => {
    expect(
      mapProgramme({ is_active: true, stamps_per_card: 6, qualifying_amount: "25.50", reward_percent: 15, currency: "EUR" }),
    ).toEqual({ stampsPerCard: 6, qualifyingAmount: 25.5, rewardPercent: 15, currency: "EUR", active: true });
  });
});

describe("mapOverview", () => {
  it("is 'start' for a member who never earned a stamp", () => {
    expect(mapOverview(overview(), DEFAULT_PROGRAMME)).toMatchObject({ id: "start", stamps: 0, total: 5, rewardReady: false });
  });

  it("collects, then is one away from the reward", () => {
    expect(mapOverview(overview({ current_stamps: 3, stamps_lifetime: 3 }), DEFAULT_PROGRAMME)).toMatchObject({ id: "collecting", stamps: 3 });
    expect(mapOverview(overview({ current_stamps: 4, stamps_lifetime: 4 }), DEFAULT_PROGRAMME)).toMatchObject({ id: "oneAway", stamps: 4 });
  });

  it("shows a full card while a reward waits, even when a new card has started", () => {
    expect(mapOverview(overview({ current_stamps: 1, rewards_available: 1 }), DEFAULT_PROGRAMME)).toMatchObject({
      id: "unlocked",
      stamps: 5,
      rewardReady: true,
    });
  });

  it("is 'renewed' on an empty card after a redeemed one", () => {
    expect(mapOverview(overview({ cards_redeemed: 1 }), DEFAULT_PROGRAMME)).toMatchObject({ id: "renewed", stamps: 0 });
  });

  it("follows the card's own size and tolerates string counts", () => {
    expect(mapOverview(overview({ current_stamps: "2", stamps_required: "3" }), DEFAULT_PROGRAMME)).toMatchObject({ id: "oneAway", total: 3 });
  });

  it("falls back to the programme size when the row has none", () => {
    expect(mapOverview(overview({ stamps_required: null }), { ...DEFAULT_PROGRAMME, stampsPerCard: 8 }).total).toBe(8);
  });
});

describe("rewardDiscount", () => {
  it("takes the percentage of the shop goods, to the cent", () => {
    expect(rewardDiscount(3000, 10)).toBe(300);
    expect(rewardDiscount(5790, 10)).toBe(579);
    expect(rewardDiscount(0, 10)).toBe(0);
  });
});

describe("qualifyingSubtotal", () => {
  it("leaves gift cards and courses out", () => {
    expect(
      qualifyingSubtotal([
        { unitPrice: 1500, qty: 2 },
        { unitPrice: 5000, qty: 1, giftCard: {} },
        { unitPrice: 9900, qty: 1, courseId: "c1" },
      ]),
    ).toBe(3000);
  });
});
