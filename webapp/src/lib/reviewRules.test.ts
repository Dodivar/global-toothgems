import { describe, expect, it } from "vitest";
import { BODY_MAX, BODY_MIN, TITLE_MAX, type CustomerReview } from "../data/reviewSystem";
import { featuredReview, matchesPublicFilter, publishedFor, sortPublic, summarise, validateReview } from "./reviewRules";

function review(patch: Partial<CustomerReview> = {}): CustomerReview {
  return {
    id: "r",
    subject: { kind: "product", id: "p1" },
    customer: {} as CustomerReview["customer"],
    orderRef: "GT-1",
    rating: 5,
    title: "Great",
    body: "x".repeat(40),
    lang: "fr",
    tags: [],
    photos: [],
    status: "published",
    submittedAt: "2026-06-01T00:00:00Z",
    helpful: 0,
    reports: [],
    notes: [],
    history: [],
    ...patch,
  };
}

describe("publishedFor", () => {
  it("shows only published reviews of the same subject", () => {
    const list = [
      review({ id: "ok" }),
      ...(["pending", "hidden", "rejected", "needsChanges"] as const).map((status) => review({ id: status, status })),
      review({ id: "other product", subject: { kind: "product", id: "p2" } }),
      review({ id: "same id, a course", subject: { kind: "course", id: "p1" } }),
    ];
    expect(publishedFor(list, { kind: "product", id: "p1" }).map((r) => r.id)).toEqual(["ok"]);
  });
});

describe("summarise", () => {
  it("returns zeros, not NaN, for no review", () => {
    const s = summarise([]);
    expect(s).toMatchObject({ count: 0, average: 0, verifiedPct: 0, positivePct: 0 });
    expect(s.buckets.map((b) => b.pct)).toEqual([0, 0, 0, 0, 0]);
  });

  it("averages to one decimal and buckets from five stars down", () => {
    const s = summarise([review({ rating: 5 }), review({ rating: 4, orderRef: null }), review({ rating: 4 })]);
    expect(s.average).toBe(4.3);
    expect(s.buckets.map((b) => [b.stars, b.count])).toEqual([[5, 1], [4, 2], [3, 0], [2, 0], [1, 0]]);
    expect(s.verifiedPct).toBe(67);
    expect(s.positivePct).toBe(100);
  });
});

describe("public filters and sorting", () => {
  it("filters by exact star count, photos and verified purchase", () => {
    expect(matchesPublicFilter(review({ rating: 4 }), "4")).toBe(true);
    expect(matchesPublicFilter(review({ rating: 4 }), "5")).toBe(false);
    expect(matchesPublicFilter(review(), "photos")).toBe(false);
    expect(matchesPublicFilter(review({ orderRef: null }), "verified")).toBe(false);
  });

  it("sorts by rating then most recent publication, without mutating its input", () => {
    const list = [
      review({ id: "old5", rating: 5, submittedAt: "2026-01-01T00:00:00Z" }),
      review({ id: "new5", rating: 5, submittedAt: "2026-01-01T00:00:00Z", publishedAt: "2026-03-01T00:00:00Z" }),
      review({ id: "three", rating: 3 }),
    ];
    expect(sortPublic(list, "highest").map((r) => r.id)).toEqual(["new5", "old5", "three"]);
    expect(sortPublic(list, "lowest")[0].id).toBe("three");
    expect(list[0].id).toBe("old5");
  });

  it("features a substantial positive review, never a short or low one", () => {
    expect(featuredReview([review({ rating: 5, body: "short" }), review({ rating: 3, body: "y".repeat(200) })])).toBeNull();
    const best = review({ id: "best", rating: 4, body: "z".repeat(121), helpful: 3 });
    expect(featuredReview([review({ rating: 5, body: "z".repeat(121), helpful: 1 }), best])?.id).toBe("best");
  });
});

describe("validateReview", () => {
  const input = { rating: 4, title: "Good", body: "b".repeat(BODY_MIN), tags: [], photos: [] };

  it("accepts the limits themselves", () => {
    expect(validateReview(input)).toEqual({});
    expect(validateReview({ ...input, title: "t".repeat(TITLE_MAX), body: "b".repeat(BODY_MAX) })).toEqual({});
  });

  it.each([
    [{ rating: 0 }, { rating: "ratingRequired" }],
    [{ rating: 6 }, { rating: "ratingRequired" }],
    [{ title: "   " }, { title: "titleRequired" }],
    [{ title: "t".repeat(TITLE_MAX + 1) }, { title: "titleTooLong" }],
    // Spaces do not count towards the minimum.
    [{ body: ` ${"b".repeat(BODY_MIN - 1)}   ` }, { body: "bodyTooShort" }],
    [{ body: "b".repeat(BODY_MAX + 1) }, { body: "bodyTooLong" }],
  ])("refuses %j", (patch, errors) => {
    expect(validateReview({ ...input, ...patch })).toEqual(errors);
  });
});
