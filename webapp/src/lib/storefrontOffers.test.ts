import { describe, expect, it } from "vitest";
import { buildOfferBook, offerPrice, type OfferCampaignRow, type OfferPromotionRow, type OfferSources } from "./storefrontOffers";

const NOW = Date.parse("2026-10-08T12:00:00Z");

const promo = (over: Partial<OfferPromotionRow> = {}): OfferPromotionRow => ({
  id: "p1",
  title: "Noël -20 %",
  description: null,
  type: "percentage",
  currency: "EUR",
  percent_off: 20,
  max_discount_amount: null,
  amount_off: null,
  buy_quantity: null,
  get_quantity: null,
  bundle_price: null,
  applies_to: "all",
  customer_eligibility: "all",
  min_subtotal_amount: null,
  min_quantity: null,
  exclude_discounted_products: true,
  starts_at: "2026-10-01T00:00:00Z",
  ends_at: null,
  promotion_translations: [{ locale: "en", title: "Christmas -20%", description: null }],
  promotion_products: [],
  promotion_categories: [],
  promotion_collections: [],
  ...over,
});
const campaign = (over: Partial<OfferCampaignRow> = {}): OfferCampaignRow => ({
  id: "c1",
  title: "Édition Noël 2027",
  description: null,
  starts_at: "2026-10-01T00:00:00Z",
  ends_at: "2026-12-31T00:00:00Z",
  theme: "noir",
  campaign_translations: [],
  campaign_products: [{ product_id: "a" }],
  ...over,
});
const book = (over: Partial<OfferSources> = {}) =>
  buildOfferBook({ promotions: [], campaigns: [], categoryIds: { gems: "cat-gems" }, collections: [{ id: "k1", product_ids: ["a"] }], ...over });
const product = { dbId: "a", cat: "gems", currency: "EUR" };

describe("which offer a product shows", () => {
  it("shows the campaign and the promotion together", () => {
    const offer = book({ promotions: [promo()], campaigns: [campaign()] }).offerFor(product, NOW);
    expect(offer?.campaign?.title).toEqual({ fr: "Édition Noël 2027", en: "Édition Noël 2027" });
    expect(offer?.promotion).toMatchObject({ type: "percentage", percent: 20, priceOffPercent: 20 });
    expect(offer?.promotion?.title).toEqual({ fr: "Noël -20 %", en: "Christmas -20%" });
  });

  it("knows nothing about an unknown product, or an offer that is over or not started", () => {
    const b = book({ promotions: [promo({ ends_at: "2026-10-05T00:00:00Z" }), promo({ id: "p2", starts_at: "2026-11-01T00:00:00Z" })], campaigns: [campaign({ ends_at: "2026-10-02T00:00:00Z" })] });
    expect(b.offerFor(product, NOW)).toBeNull();
    expect(book({ promotions: [promo()] }).offerFor({ cat: "gems" }, NOW)).toBeNull();
  });

  it("follows the scope: products, categories, collections, exclusions, bundles", () => {
    const scoped = (over: Partial<OfferPromotionRow>) => book({ promotions: [promo(over)] }).offerFor(product, NOW)?.promotion ?? null;
    expect(scoped({ applies_to: "products", promotion_products: [{ product_id: "a", role: "eligible" }] })).not.toBeNull();
    expect(scoped({ applies_to: "products", promotion_products: [{ product_id: "b", role: "eligible" }] })).toBeNull();
    expect(scoped({ applies_to: "categories", promotion_categories: [{ category_id: "cat-gems" }] })).not.toBeNull();
    expect(scoped({ applies_to: "categories", promotion_categories: [{ category_id: "cat-other" }] })).toBeNull();
    expect(scoped({ applies_to: "collections", promotion_collections: [{ collection_id: "k1" }] })).not.toBeNull();
    expect(scoped({ promotion_products: [{ product_id: "a", role: "excluded" }] })).toBeNull();
    expect(scoped({ type: "bundle", percent_off: null, bundle_price: 59, promotion_products: [{ product_id: "a", role: "bundle" }] })).toMatchObject({ type: "bundle", bundleCents: 5900, priceOffPercent: null });
  });

  it("leaves out customer-specific offers, free shipping, and products already on sale when excluded", () => {
    expect(book({ promotions: [promo({ customer_eligibility: "new" })] }).offerFor(product, NOW)).toBeNull();
    expect(book({ promotions: [promo({ type: "free_shipping", percent_off: null })] }).offerFor(product, NOW)).toBeNull();
    expect(book({ promotions: [promo()] }).offerFor({ ...product, compareAtPrice: 50 }, NOW)).toBeNull();
    expect(book({ promotions: [promo({ exclude_discounted_products: false })] }).offerFor({ ...product, compareAtPrice: 50 }, NOW)?.promotion).not.toBeNull();
  });

  it("changes the unit price only for an unconditional, uncapped percentage", () => {
    const priceOff = (over: Partial<OfferPromotionRow>) => book({ promotions: [promo(over)] }).offerFor(product, NOW)?.promotion?.priceOffPercent;
    expect(priceOff({})).toBe(20);
    expect(priceOff({ min_subtotal_amount: 50 })).toBeNull();
    expect(priceOff({ min_quantity: 2 })).toBeNull();
    expect(priceOff({ max_discount_amount: 10 })).toBeNull();
    expect(book({ promotions: [promo({ min_subtotal_amount: 50 })] }).offerFor(product, NOW)?.promotion?.conditional).toBe(true);
  });

  it("prefers a cheaper unit, then the biggest cut", () => {
    const b = book({ promotions: [promo({ id: "g", type: "gift", percent_off: null }), promo({ id: "p10", percent_off: 10 }), promo({ id: "p30", percent_off: 30 })] });
    expect(b.offerFor(product, NOW)?.promotion?.id).toBe("p30");
  });
});

describe("the price shown", () => {
  const offer = (percent: number | null) => book({ promotions: [promo({ percent_off: percent })] }).offerFor(product, NOW);
  it("strikes the price before the cut", () => {
    expect(offerPrice(44.95, undefined, offer(20))).toEqual({ price: 35.96, was: 44.95 });
  });
  it("strikes the product's own was-price when it has one", () => {
    const withCompare = book({ promotions: [promo({ exclude_discounted_products: false })] }).offerFor({ ...product, compareAtPrice: 60 }, NOW);
    expect(offerPrice(50, 60, withCompare)).toEqual({ price: 40, was: 60 });
  });
  it("leaves the price alone without a price cut", () => {
    expect(offerPrice(10, 12, null)).toEqual({ price: 10, was: 12 });
    expect(offerPrice(10, undefined, book({ promotions: [promo({ type: "gift", percent_off: null })] }).offerFor(product, NOW))).toEqual({ price: 10, was: undefined });
  });
});
