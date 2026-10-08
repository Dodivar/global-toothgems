import { describe, expect, it } from "vitest";
import { blankCampaign, blankPromotion, promotionStatus, toLocalInput, toTime, campaignStatus } from "../data/adminPromotions";
import {
  campaignPayload,
  classifyWriteError,
  dailySeries,
  decimal,
  mapCampaign,
  mapCollection,
  mapPromotion,
  promotionPayload,
  uniqueCodePrefix,
  type CampaignRow,
  type PromotionRow,
} from "./promotionMapping";

const row: PromotionRow = {
  id: "p1",
  name: "Spring -20%",
  internal_description: null,
  title: "Printemps -20 %",
  description: null,
  type: "percentage",
  percent_off: 20,
  max_discount_amount: "50.00",
  amount_off: null,
  buy_quantity: null,
  get_quantity: null,
  reward_percent: null,
  bundle_price: null,
  gift_product_id: null,
  gift_variant_id: null,
  applies_to: "products",
  customer_eligibility: "all",
  min_subtotal_amount: 40,
  min_quantity: null,
  max_uses_total: 500,
  max_uses_per_customer: 1,
  combinable: false,
  combinable_with_loyalty: false,
  exclude_discounted_products: true,
  activation: "code",
  code_kind: "shared",
  starts_at: "2026-07-01T08:00:00+00:00",
  ends_at: null,
  timezone: "Europe/Paris",
  lifecycle: "live",
  campaign_id: null,
  created_at: "2026-06-20T10:00:00+00:00",
  updated_at: "2026-06-21T10:00:00+00:00",
  promotion_translations: [{ locale: "en", title: "Spring -20%", description: "Sparkle" }],
  promotion_products: [
    { product_id: "a", role: "eligible" },
    { product_id: "x", role: "excluded" },
  ],
  promotion_categories: [],
  promotion_collections: [],
  promotion_segments: [],
  promotion_codes: [
    { code: "OLD20", is_active: false },
    { code: "SPRING20", is_active: true },
  ],
};

describe("time zones", () => {
  it("reads a local date-time in its zone, summer and winter time included", () => {
    expect(new Date(toTime("2026-07-01T10:00", "Europe/Paris")).toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(new Date(toTime("2026-01-15T10:00", "Europe/Paris")).toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(new Date(toTime("2026-07-01T10:00", "Europe/London")).toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(new Date(toTime("2026-07-01T10:00", "UTC")).toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });

  it("is the inverse of toLocalInput", () => {
    expect(toLocalInput("2026-07-01T08:00:00+00:00", "Europe/Paris")).toBe("2026-07-01T10:00");
    expect(toLocalInput("2026-12-31T23:30:00+00:00", "Europe/Paris")).toBe("2027-01-01T00:30");
    expect(toTime(toLocalInput("2026-03-29T00:59:00Z", "Europe/Paris"), "Europe/Paris")).toBe(Date.parse("2026-03-29T00:59:00Z"));
  });

  it("derives the status from the lifecycle and the real calendar", () => {
    const base = { lifecycle: "live" as const, schedule: { startsAt: "2026-07-01T10:00", endsAt: "2026-07-10T10:00", timezone: "Europe/Paris" as const } };
    const at = (iso: string) => Date.parse(iso);
    expect(promotionStatus(base, at("2026-06-30T12:00:00Z"))).toBe("scheduled");
    expect(promotionStatus(base, at("2026-07-01T07:59:00Z"))).toBe("scheduled");
    expect(promotionStatus(base, at("2026-07-01T08:00:00Z"))).toBe("active");
    expect(promotionStatus(base, at("2026-07-10T08:00:00Z"))).toBe("expired");
    expect(promotionStatus({ ...base, lifecycle: "paused" }, at("2026-07-02T00:00:00Z"))).toBe("paused");
    expect(promotionStatus({ ...base, lifecycle: "draft" }, at("2026-07-02T00:00:00Z"))).toBe("draft");
    const c = { lifecycle: "live" as const, startsAt: "2026-11-20T00:00", endsAt: "2026-11-30T23:59", timezone: "Europe/Paris" as const };
    expect(campaignStatus(c, at("2026-12-01T00:00:00Z"))).toBe("completed");
  });
});

describe("reading a promotion", () => {
  const overview = { id: "p1", orders: 3, revenue_amount: "412.50", discount_amount: 31.2 };

  it("maps the row, its children and its figures", () => {
    const p = mapPromotion(row, overview, [0, 1]);
    expect(p).toMatchObject({
      id: "p1",
      customerTitle: { fr: "Printemps -20 %", en: "Spring -20%" },
      customerDescription: { fr: "", en: "Sparkle" },
      discount: { type: "percentage", percent: 20, maxDiscountCents: 5000 },
      eligibility: { scope: "products", productIds: ["a"], minCartCents: 4000, customers: "all" },
      usage: { maxTotal: 500, maxPerCustomer: 1, excludeDiscounted: true, excludedProductIds: ["x"] },
      schedule: { startsAt: "2026-07-01T10:00", endsAt: null, timezone: "Europe/Paris" },
      code: { mode: "code", code: "SPRING20", kind: "shared", uniqueCount: null },
      lifecycle: "live",
      stats: { uses: 3, orders: 3, revenueCents: 41250, discountCents: 3120, daily: [0, 1] },
    });
  });

  it("reads the unique codes as a count and a prefix", () => {
    const p = mapPromotion(
      { ...row, code_kind: "unique", promotion_codes: [{ code: "SPR-AAAA1111", is_active: true }, { code: "SPR-BBBB2222", is_active: true }] },
      undefined,
      [],
    );
    expect(p?.code).toEqual({ mode: "code", code: "SPR", kind: "unique", uniqueCount: 2 });
    expect(p?.stats.revenueCents).toBe(0);
  });

  it("maps the other types and refuses an unknown one", () => {
    expect(mapPromotion({ ...row, type: "buy_x_get_y", percent_off: null, buy_quantity: 2, get_quantity: 1, reward_percent: 100 }, undefined, [])?.discount).toEqual({
      type: "bxgy",
      buyQty: 2,
      getQty: 1,
      rewardPercent: 100,
    });
    expect(
      mapPromotion({ ...row, type: "bundle", percent_off: null, bundle_price: 59, promotion_products: [{ product_id: "b1", role: "bundle" }, { product_id: "b2", role: "bundle" }] }, undefined, [])
        ?.discount,
    ).toEqual({ type: "bundle", bundleProductIds: ["b1", "b2"], bundlePriceCents: 5900 });
    expect(mapPromotion({ ...row, type: "mystery" }, undefined, [])).toBeNull();
  });
});

describe("writing a promotion", () => {
  const p = mapPromotion(row, undefined, [])!;

  it("sends exact decimals and only the parameters of its type", () => {
    const payload = promotionPayload({ ...p, discount: { type: "percentage", percent: 15, maxDiscountCents: 1999 } }) as Record<string, unknown>;
    expect(payload).toMatchObject({
      id: "p1",
      type: "percentage",
      percent_off: 15,
      max_discount_amount: 19.99,
      amount_off: null,
      buy_quantity: null,
      bundle_price: null,
      gift_product_id: null,
      min_subtotal_amount: 40,
      activation: "code",
      code_kind: "shared",
      code: "SPRING20",
      unique_code_count: 0,
      starts_at: "2026-07-01T10:00",
      ends_at: null,
      lifecycle: "live",
    });
  });

  it("maps the types to the database's names", () => {
    const send = (discount: Parameters<typeof promotionPayload>[0]["discount"]) =>
      (promotionPayload({ ...p, discount }) as Record<string, unknown>).type;
    expect(send({ type: "fixed", amountCents: 500 })).toBe("fixed_amount");
    expect(send({ type: "bxgy", buyQty: 2, getQty: 1 })).toBe("buy_x_get_y");
    expect(send({ type: "freeShipping" })).toBe("free_shipping");
    const gift = promotionPayload({ ...p, discount: { type: "gift", giftProductId: "g", giftVariantId: "v" } }) as Record<string, unknown>;
    expect(gift).toMatchObject({ gift_product_id: "g", gift_variant_id: "v", percent_off: null });
  });

  it("asks for unique codes with a clean prefix, and for none otherwise", () => {
    const unique = promotionPayload({ ...p, code: { mode: "code", kind: "unique", code: "spring-2026!", uniqueCount: 50 } }) as Record<string, unknown>;
    expect(unique).toMatchObject({ code_kind: "unique", code: "", unique_code_count: 50, unique_code_prefix: "SPRING2026" });
    const auto = promotionPayload({ ...p, code: { mode: "automatic", kind: "shared", code: "KEEP", uniqueCount: null } }) as Record<string, unknown>;
    expect(auto).toMatchObject({ activation: "automatic", code_kind: null, code: "" });
    expect(uniqueCodePrefix("a-b c")).toBe("ABC");
  });

  it("leaves the id out of a new promotion and keeps both languages", () => {
    const blank = blankPromotion(null);
    const payload = promotionPayload({ ...blank, name: " X ", customerTitle: { fr: "Un", en: "One" } }) as Record<string, unknown>;
    expect(payload.id).toBeNull();
    expect(payload.name).toBe("X");
    expect(payload.title).toEqual({ fr: "Un", en: "One" });
  });

  it("converts cents without float drift", () => {
    expect(decimal(1999)).toBe(19.99);
    expect(decimal(1005)).toBe(10.05);
    expect(decimal(7)).toBe(0.07);
  });
});

describe("campaigns and reference lists", () => {
  const campaignRow: CampaignRow = {
    id: "c1",
    name: "Black Friday",
    internal_description: null,
    title: "Black Friday",
    description: "Tout brille",
    starts_at: "2026-11-26T23:00:00+00:00",
    ends_at: "2026-11-30T22:59:00+00:00",
    timezone: "Europe/Paris",
    theme: "noir",
    cover_path: "img-05.jpg",
    lifecycle: "live",
    created_at: "2026-10-01T10:00:00+00:00",
    updated_at: "2026-10-02T10:00:00+00:00",
    campaign_translations: [{ locale: "en", title: "Black Friday", description: "Everything sparkles" }],
    campaign_products: [
      { product_id: "b", position: 1 },
      { product_id: "a", position: 0 },
    ],
  };

  it("reads a campaign in its own zone with ordered products", () => {
    expect(mapCampaign(campaignRow)).toMatchObject({
      startsAt: "2026-11-27T00:00",
      endsAt: "2026-11-30T23:59",
      theme: "noir",
      cover: "img-05.jpg",
      productIds: ["a", "b"],
      description: { fr: "Tout brille", en: "Everything sparkles" },
    });
  });

  it("writes it back with the ordered products and the cover", () => {
    const payload = campaignPayload({ ...mapCampaign(campaignRow), cover: null }) as Record<string, unknown>;
    expect(payload).toMatchObject({ id: "c1", cover_path: null, product_ids: ["a", "b"], starts_at: "2026-11-27T00:00", timezone: "Europe/Paris" });
    expect((campaignPayload(blankCampaign()) as Record<string, unknown>).id).toBeNull();
  });

  it("names a collection in both languages once its translation is published", () => {
    const collection = mapCollection({
      id: "k",
      name: "Nouveautés",
      collection_translations: [
        { locale: "en", name: "New in", status: "published" },
        { locale: "de", name: "Neu", status: "published" },
      ],
      collection_products: [{ product_id: "a", position: 0 }],
    });
    expect(collection).toEqual({ id: "k", name: { fr: "Nouveautés", en: "New in" }, productIds: ["a"] });
    expect(mapCollection({ id: "k", name: "Nouveautés", collection_translations: [{ locale: "en", name: "Draft", status: "draft" }], collection_products: [] }).name.en).toBe("Nouveautés");
  });
});

describe("daily uses", () => {
  it("fills the last 14 days oldest first, zero where nothing happened", () => {
    const series = dailySeries(
      [
        { day: "2026-10-07", uses: 4 },
        { day: "2026-10-05", uses: 2 },
        { day: "2026-09-01", uses: 9 },
      ],
      "2026-10-07",
    );
    expect(series).toHaveLength(14);
    expect(series[13]).toBe(4);
    expect(series[11]).toBe(2);
    expect(series.reduce((a, b) => a + b, 0)).toBe(6);
  });
});

describe("refusals", () => {
  it("classifies what the database says", () => {
    expect(classifyWriteError({ code: "42501" })).toBe("notAllowed");
    expect(classifyWriteError({ code: "23505", message: 'duplicate key value violates unique constraint "promotion_codes_code_idx"' })).toBe("codeTaken");
    expect(classifyWriteError({ code: "23505", message: "other" })).toBe("invalid");
    expect(classifyWriteError({ code: "23514", message: "promotions: choose at least one product" })).toBe("incomplete");
    expect(classifyWriteError({ code: "22023" })).toBe("invalid");
    expect(classifyWriteError({ code: "P0002" })).toBe("notFound");
    expect(classifyWriteError({ code: "XX000" })).toBe("failed");
  });
});
