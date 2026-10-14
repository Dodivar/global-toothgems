import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blankPromotion, promotionStatus, toTime, type Promotion } from "../data/adminPromotions";
import {
  activePromotionFilterCount,
  codeTaken,
  coveredProductIds,
  discountedUnitCents,
  draftIssues,
  EMPTY_PROMOTION_FILTERS,
  filterPromotions,
  parseEuros,
  validatePromotion,
} from "./promotionRules";

/* The rules the back office applies before saving; the database re-checks every one (admin_save_promotion). */

const NOW = Date.UTC(2026, 5, 15, 10, 0); // 15 June 2026, 12:00 in Paris

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function promo(patch: Partial<Promotion> = {}): Promotion {
  const base = blankPromotion();
  return {
    ...base,
    id: "p1",
    name: "Summer",
    customerTitle: { fr: "Été", en: "Summer" },
    schedule: { startsAt: "2026-06-01T00:00", endsAt: "2026-06-30T23:59", timezone: "Europe/Paris" },
    lifecycle: "live",
    createdAt: "2026-05-01T00:00:00Z",
    ...patch,
  };
}

const fieldsOf = (p: Promotion) => validatePromotion(p).map((i) => i.field);

describe("validatePromotion", () => {
  it("accepts a complete percentage promotion", () => {
    expect(validatePromotion(promo())).toEqual([]);
  });

  it.each([
    ["no internal name", { name: "   " }, "name"],
    ["no French customer title", { customerTitle: { fr: "", en: "Summer" } }, "customerTitle"],
  ] as const)("refuses %s", (_label, patch, field) => {
    expect(fieldsOf(promo(patch as Partial<Promotion>))).toContain(field);
  });

  it.each([
    [0, false],
    [1, true],
    [100, true],
    [101, false],
  ])("percentage %i%% is valid: %s", (percent, valid) => {
    const p = promo({ discount: { type: "percentage", percent } });
    expect(fieldsOf(p).includes("percent")).toBe(!valid);
  });

  it.each([
    ["fixed amount of zero", { type: "fixed", amountCents: 0 }, "amount"],
    ["fixed amount below zero", { type: "fixed", amountCents: -100 }, "amount"],
    ["buy X get Y without Y", { type: "bxgy", buyQty: 2, getQty: 0 }, "buyGet"],
    ["bundle of one product", { type: "bundle", bundleProductIds: ["a"], bundlePriceCents: 1000 }, "bundle"],
    ["bundle without a price", { type: "bundle", bundleProductIds: ["a", "b"] }, "bundle"],
    ["gift without a product", { type: "gift" }, "gift"],
  ] as const)("refuses a %s", (_label, discount, field) => {
    expect(fieldsOf(promo({ discount: discount as Promotion["discount"] }))).toContain(field);
  });

  it("refuses a scope that selects nothing", () => {
    const base = promo();
    const p = promo({ eligibility: { ...base.eligibility, scope: "products", productIds: [] } });
    expect(fieldsOf(p)).toContain("scope");
  });

  it("refuses an end at or before the start", () => {
    const p = promo({ schedule: { startsAt: "2026-06-10T10:00", endsAt: "2026-06-10T10:00", timezone: "Europe/Paris" } });
    expect(validatePromotion(p).find((i) => i.field === "schedule")?.key).toBe("endBeforeStart");
  });

  it.each([
    ["", "codeRequired"],
    ["ABC", "codeFormat"],
    ["HAS SPACE", "codeFormat"],
    ["A".repeat(25), "codeFormat"],
  ])("refuses the shared code %j (%s)", (code, key) => {
    const p = promo({ code: { mode: "code", kind: "shared", code, uniqueCount: null } });
    expect(validatePromotion(p).find((i) => i.field === "code")?.key).toBe(key);
  });

  it("accepts a shared code of 4 to 24 letters, digits, - or _", () => {
    for (const code of ["ABCD", "summer_26", "X-".repeat(12)]) {
      expect(fieldsOf(promo({ code: { mode: "code", kind: "shared", code, uniqueCount: null } }))).not.toContain("code");
    }
  });

  it("refuses a per-customer limit above the total limit", () => {
    const base = promo();
    expect(fieldsOf(promo({ usage: { ...base.usage, maxTotal: 10, maxPerCustomer: 11 } }))).toContain("usage");
    expect(fieldsOf(promo({ usage: { ...base.usage, maxTotal: 10, maxPerCustomer: 10 } }))).not.toContain("usage");
  });

  it("keeps only what the database refuses even for a draft", () => {
    const p = promo({ name: "", schedule: { startsAt: "", endsAt: null, timezone: "Europe/Paris" } });
    expect(draftIssues(validatePromotion(p)).map((i) => i.field)).toEqual(["name"]);
  });
});

describe("codeTaken", () => {
  const others = [promo({ id: "a", code: { mode: "code", kind: "shared", code: "SUMMER", uniqueCount: null } })];

  it("matches codes case-insensitively, ignoring surrounding spaces", () => {
    expect(codeTaken(" summer ", others, "b")).toBe(true);
  });
  it("does not count the promotion being edited", () => {
    expect(codeTaken("SUMMER", others, "a")).toBe(false);
  });
  it("treats an empty code as free", () => {
    expect(codeTaken("  ", others, "b")).toBe(false);
  });
});

describe("parseEuros", () => {
  it.each([
    ["12,50", 1250],
    ["12.5", 1250],
    ["1 234,56", 123456],
    ["0", 0],
    // 0.1 + 0.2 style float noise must not leak into cents.
    ["19.99", 1999],
    ["", null],
    ["   ", null],
    ["-1", null],
    ["abc", null],
  ])("%j → %s", (input, cents) => {
    expect(parseEuros(input)).toBe(cents);
  });
});

describe("discountedUnitCents", () => {
  it("takes a rounded percentage off", () => {
    expect(discountedUnitCents(999, promo({ discount: { type: "percentage", percent: 15 } }))).toBe(849);
  });
  it("caps a percentage at its maximum discount", () => {
    expect(discountedUnitCents(10_000, promo({ discount: { type: "percentage", percent: 50, maxDiscountCents: 1_000 } }))).toBe(9_000);
  });
  it("never goes below zero", () => {
    expect(discountedUnitCents(500, promo({ discount: { type: "fixed", amountCents: 800 } }))).toBe(0);
  });
  it("leaves the unit price alone when a fixed amount needs a minimum basket", () => {
    const base = promo();
    const p = promo({ discount: { type: "fixed", amountCents: 500 }, eligibility: { ...base.eligibility, minCartCents: 5_000 } });
    expect(discountedUnitCents(2_000, p)).toBe(2_000);
  });
  it.each(["bxgy", "bundle", "gift"] as const)("leaves the unit price alone for %s (cart-level types)", (type) => {
    expect(discountedUnitCents(2_000, promo({ discount: { type } }))).toBe(2_000);
  });
});

describe("coveredProductIds", () => {
  const byCategory = (id: string) => (id === "c1" ? ["p1", "p2"] : []);
  const base = promo();

  it("returns null for every product", () => {
    expect(coveredProductIds(base, byCategory)).toBeNull();
  });
  it("expands categories and collections", () => {
    expect(coveredProductIds(promo({ eligibility: { ...base.eligibility, scope: "categories", categoryIds: ["c1"] } }), byCategory)).toEqual(["p1", "p2"]);
    const collections = [{ id: "k", name: { fr: "", en: "" }, productIds: ["p9"] }];
    expect(coveredProductIds(promo({ eligibility: { ...base.eligibility, scope: "collections", collectionIds: ["k", "missing"] } }), byCategory, collections)).toEqual(["p9"]);
  });
  it("uses a bundle's own products whatever the scope", () => {
    expect(coveredProductIds(promo({ discount: { type: "bundle", bundleProductIds: ["x", "y"], bundlePriceCents: 100 } }), byCategory)).toEqual(["x", "y"]);
  });
});

describe("promotionStatus (shop time, Europe/Paris)", () => {
  it.each([
    ["draft", { lifecycle: "draft" }, "draft"],
    ["archived", { lifecycle: "archived" }, "archived"],
    ["running", {}, "active"],
    ["not started", { schedule: { startsAt: "2026-06-15T12:01", endsAt: null, timezone: "Europe/Paris" } }, "scheduled"],
    ["starting this minute", { schedule: { startsAt: "2026-06-15T12:00", endsAt: null, timezone: "Europe/Paris" } }, "active"],
    ["ending this minute", { schedule: { startsAt: "2026-06-01T00:00", endsAt: "2026-06-15T12:00", timezone: "Europe/Paris" } }, "expired"],
    ["paused", { lifecycle: "paused" }, "paused"],
    ["paused but over", { lifecycle: "paused", schedule: { startsAt: "2026-05-01T00:00", endsAt: "2026-05-31T23:59", timezone: "Europe/Paris" } }, "expired"],
  ] as const)("%s → %s", (_label, patch, status) => {
    expect(promotionStatus(promo(patch as Partial<Promotion>))).toBe(status);
  });

  it("reads a local time in the shop's zone across the summer-time change", () => {
    expect(toTime("2026-06-15T12:00", "Europe/Paris")).toBe(NOW);
    expect(toTime("2026-01-15T12:00", "Europe/Paris")).toBe(Date.UTC(2026, 0, 15, 11, 0));
    expect(toTime("not a date")).toBeNaN();
  });
});

describe("filterPromotions", () => {
  const list = [
    promo({ id: "a", name: "Alpha", createdAt: "2026-05-01T00:00:00Z" }),
    promo({ id: "b", name: "Beta", lifecycle: "archived", createdAt: "2026-05-02T00:00:00Z" }),
    promo({ id: "c", name: "Gamma", schedule: { startsAt: "2026-07-01T00:00", endsAt: null, timezone: "Europe/Paris" }, createdAt: "2026-05-03T00:00:00Z" }),
  ];
  const run = (patch: Partial<typeof EMPTY_PROMOTION_FILTERS>, tab: Parameters<typeof filterPromotions>[2] = "all") =>
    filterPromotions(list, { ...EMPTY_PROMOTION_FILTERS, ...patch }, tab, () => "", () => []).map((p) => p.id);

  it("hides archived promotions unless a status asks for them, newest first", () => {
    expect(run({})).toEqual(["c", "a"]);
    expect(run({ statuses: ["archived"] })).toEqual(["b"]);
  });
  it("narrows to a tab's status", () => {
    expect(run({}, "scheduled")).toEqual(["c"]);
  });
  it("searches the name case-insensitively", () => {
    expect(run({ query: "  GAM " })).toEqual(["c"]);
  });
  it("counts the active filters", () => {
    expect(activePromotionFilterCount(EMPTY_PROMOTION_FILTERS)).toBe(0);
    expect(activePromotionFilterCount({ ...EMPTY_PROMOTION_FILTERS, query: "x", from: "2026-01-01", to: "2026-02-01" })).toBe(2);
  });
});
