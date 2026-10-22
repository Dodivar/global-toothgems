import { describe, expect, it } from "vitest";
import {
  activitySectionAt,
  loyaltyFingerprints,
  parseSeenState,
  reviewFingerprints,
  unseenCount,
} from "./memberActivity";
import type { CustomerReview } from "../data/reviewSystem";

describe("unseenCount", () => {
  it("counts nothing for a section never seen on this browser", () => {
    expect(unseenCount(["a", "b"], undefined)).toBe(0);
  });

  it("counts the fingerprints missing from the seen set", () => {
    expect(unseenCount(["a", "b", "c"], ["a"])).toBe(2);
    expect(unseenCount(["a"], ["a", "gone"])).toBe(0);
  });
});

describe("activitySectionAt", () => {
  it("matches a section and the pages under it, never a mere prefix", () => {
    expect(activitySectionAt("/compte/commandes")).toBe("orders");
    expect(activitySectionAt("/compte/commandes/GT-1001")).toBe("orders");
    expect(activitySectionAt("/compte/avis")).toBe("reviews");
    expect(activitySectionAt("/compte/fidelite")).toBe("loyalty");
    expect(activitySectionAt("/compte/commandesx")).toBeNull();
    expect(activitySectionAt("/compte")).toBeNull();
  });
});

describe("fingerprints", () => {
  it("lights the loyalty entry only while a full card waits, once per card", () => {
    expect(loyaltyFingerprints(null)).toEqual([]);
    expect(loyaltyFingerprints({ rewardReady: false, lifetime: 4 })).toEqual([]);
    expect(loyaltyFingerprints({ rewardReady: true, lifetime: 5 })).not.toEqual(
      loyaltyFingerprints({ rewardReady: true, lifetime: 10 }),
    );
  });

  it("changes a review's fingerprint when the team handles or answers it", () => {
    const review = { id: "r1", mine: true, status: "pending" } as CustomerReview;
    const [pending] = reviewFingerprints([review], []);
    const [published] = reviewFingerprints([{ ...review, status: "published" }], []);
    const [answered] = reviewFingerprints(
      [{ ...review, status: "published", response: {} as CustomerReview["response"] }],
      [],
    );
    expect(new Set([pending, published, answered]).size).toBe(3);
    expect(reviewFingerprints([{ ...review, mine: false }], [])).toEqual([]);
    expect(reviewFingerprints([], [{ subject: { kind: "product", id: "p1" } }])).toHaveLength(1);
  });
});

describe("parseSeenState", () => {
  it("keeps well-formed sections and drops the rest", () => {
    expect(parseSeenState(JSON.stringify({ orders: ["a"], reviews: [1], other: ["x"] }))).toEqual({ orders: ["a"] });
    expect(parseSeenState("not json")).toEqual({});
    expect(parseSeenState(null)).toEqual({});
  });
});
