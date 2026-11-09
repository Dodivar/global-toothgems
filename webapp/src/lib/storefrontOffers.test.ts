import { describe, expect, it } from "vitest";
import {
  basketLineStruck,
  buildOfferBook,
  mapPriceReference,
  offerPrice,
  promotionBadgeShown,
  type OfferCampaignRow,
  type OfferPromotionRow,
  type OfferSources,
  type PriceReferenceRow,
} from "./storefrontOffers";

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
  applies_to: "products",
  customer_eligibility: "all",
  min_subtotal_amount: null,
  min_quantity: null,
  exclude_discounted_products: true,
  starts_at: "2026-10-01T00:00:00Z",
  ends_at: null,
  promotion_translations: [{ locale: "en", title: "Christmas -20%", description: null }],
  promotion_products: [{ product_id: "a", role: "eligible" }],
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
const ref = (over: Partial<PriceReferenceRow> = {}): PriceReferenceRow => ({
  product_id: "a",
  variant_id: null,
  course_id: null,
  currency: "EUR",
  list_price: "44.95",
  price: "35.96",
  reference_price: "44.95",
  discount_percent: 20,
  reduction_started_at: "2026-10-01T00:00:00Z",
  state: "reduced",
  ...over,
});

describe("which offer a product shows", () => {
  it("shows the campaign and the promotion together", () => {
    const offer = book({ promotions: [promo()], campaigns: [campaign()] }).offerFor(product, NOW);
    expect(offer?.campaign?.title).toEqual({ fr: "Édition Noël 2027", en: "Édition Noël 2027" });
    expect(offer?.promotion).toMatchObject({ type: "percentage", priceOffPercent: 20 });
    expect(offer?.promotion?.title).toEqual({ fr: "Noël -20 %", en: "Christmas -20%" });
  });

  it("announces the database's percentage on a unit price cut, never the promotion's own", () => {
    // No reference read (yet): no percentage to announce.
    expect(book({ promotions: [promo()] }).offerFor(product, NOW)?.promotion?.percent).toBeNull();
    // Reduced: the percentage computed on the reference price.
    expect(book({ promotions: [promo()], references: [ref({ discount_percent: 12 })] }).offerFor(product, NOW)?.promotion?.percent).toBe(12);
    // A lower price in the 30 days before: no percentage at all.
    expect(
      book({ promotions: [promo()], references: [ref({ state: "not_lower", reference_price: "30.00", discount_percent: null })] }).offerFor(product, NOW)?.promotion
        ?.percent,
    ).toBeNull();
    // A conditional percentage does not cut the unit price: its own wording stays.
    expect(book({ promotions: [promo({ min_subtotal_amount: 50 })] }).offerFor(product, NOW)?.promotion?.percent).toBe(20);
  });

  it("finds the reference of the variant shown, and of a course", () => {
    const b = book({ references: [ref(), ref({ variant_id: "v1", price: "8.00", reference_price: "10.00", discount_percent: 20 }), ref({ product_id: null, course_id: "c9" })] });
    expect(b.offerFor(product, NOW)?.reference?.priceCents).toBe(3596);
    expect(b.offerFor({ ...product, variantId: "v1" }, NOW)?.reference?.struckCents).toBe(1000);
    expect(b.offerFor({ ...product, variantId: "v2" }, NOW)).toBeNull();
    expect(b.courseReference("c9")?.struckCents).toBe(4495);
    expect(b.courseReference("c0")).toBeNull();
  });

  it("knows nothing about an unknown product, or an offer that is over or not started", () => {
    const b = book({ promotions: [promo({ ends_at: "2026-10-05T00:00:00Z" }), promo({ id: "p2", starts_at: "2026-11-01T00:00:00Z" })], campaigns: [campaign({ ends_at: "2026-10-02T00:00:00Z" })] });
    expect(b.offerFor(product, NOW)).toBeNull();
    expect(book({ promotions: [promo()] }).offerFor({ cat: "gems" }, NOW)).toBeNull();
  });

  it("follows the scope: only specifically chosen products and bundles get a badge", () => {
    const scoped = (over: Partial<OfferPromotionRow>) => book({ promotions: [promo(over)] }).offerFor(product, NOW)?.promotion ?? null;
    expect(scoped({ applies_to: "products", promotion_products: [{ product_id: "a", role: "eligible" }] })).not.toBeNull();
    expect(scoped({ applies_to: "products", promotion_products: [{ product_id: "b", role: "eligible" }] })).toBeNull();
    expect(scoped({ applies_to: "all" })).toBeNull();
    expect(scoped({ applies_to: "categories", promotion_categories: [{ category_id: "cat-gems" }] })).toBeNull();
    expect(scoped({ applies_to: "collections", promotion_collections: [{ collection_id: "k1" }] })).toBeNull();
    expect(scoped({ applies_to: "products", promotion_products: [{ product_id: "a", role: "eligible" }, { product_id: "a", role: "excluded" }] })).toBeNull();
    expect(scoped({ type: "bundle", percent_off: null, bundle_price: 59, promotion_products: [{ product_id: "a", role: "bundle" }] })).toMatchObject({ type: "bundle", bundleCents: 5900, priceOffPercent: null });
  });

  it("leaves out customer-specific offers and free shipping", () => {
    expect(book({ promotions: [promo({ customer_eligibility: "new" })] }).offerFor(product, NOW)).toBeNull();
    expect(book({ promotions: [promo({ type: "free_shipping", percent_off: null })] }).offerFor(product, NOW)).toBeNull();
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

describe("the price shown (Omnibus, decision 129)", () => {
  it("strikes the database's reference price, with its percentage", () => {
    const offer = book({ promotions: [promo()], references: [ref()] }).offerFor(product, NOW);
    expect(offerPrice(44.95, offer)).toEqual({ price: 35.96, was: 44.95, percent: 20 });
  });
  it("shows the cut price but strikes nothing when the price is not below the reference", () => {
    const offer = book({ references: [ref({ state: "not_lower", reference_price: "30.00", discount_percent: null })] }).offerFor(product, NOW);
    expect(offerPrice(44.95, offer)).toEqual({ price: 35.96, was: undefined, percent: null });
    const fresh = book({ references: [ref({ state: "no_history", reference_price: null, discount_percent: null })] }).offerFor(product, NOW);
    expect(offerPrice(44.95, fresh)).toEqual({ price: 35.96, was: undefined, percent: null });
  });
  it("never strikes the price before the cut on its own, nor without a reference", () => {
    expect(offerPrice(44.95, book({ promotions: [promo()] }).offerFor(product, NOW))).toEqual({ price: 44.95, was: undefined, percent: null });
    expect(offerPrice(10, null)).toEqual({ price: 10, was: undefined, percent: null });
  });
});

describe("mapPriceReference", () => {
  it("maps decimals to minor units", () => {
    expect(mapPriceReference(ref({ list_price: 20, price: 15, reference_price: 20, discount_percent: 25 }))).toEqual({
      currency: "EUR",
      listCents: 2000,
      priceCents: 1500,
      struckCents: 2000,
      percent: 25,
      state: "reduced",
    });
  });
  it("refuses a struck price whose figures disagree, and an unknown state", () => {
    expect(mapPriceReference(ref({ price: "20.00", reference_price: "20.00" }))).toMatchObject({ struckCents: null, percent: null, state: "not_lower" });
    expect(mapPriceReference(ref({ reference_price: null }))).toMatchObject({ struckCents: null, state: "not_lower" });
    expect(mapPriceReference(ref({ state: "whatever" }))).toMatchObject({ struckCents: null, state: "not_lower" });
    expect(mapPriceReference(ref({ discount_percent: 0 }))).toMatchObject({ struckCents: 4495, percent: null });
    expect(mapPriceReference(ref({ price: "abc" }))).toBeNull();
  });
});

describe("basketLineStruck", () => {
  const reduced = mapPriceReference(ref());
  const notLower = mapPriceReference(ref({ state: "not_lower", reference_price: "30.00", discount_percent: null }));
  it("strikes nothing on a line without discount", () => {
    expect(basketLineStruck({ unitCents: 4495, qty: 2, cutCents: 0 }, reduced)).toBeNull();
  });
  it("follows the shop window's rule when a cut runs for everyone", () => {
    expect(basketLineStruck({ unitCents: 4495, qty: 2, cutCents: 1798 }, reduced)).toBe(8990);
    expect(basketLineStruck({ unitCents: 4495, qty: 2, cutCents: 1798 }, notLower)).toBeNull();
  });
  it("shows the total before a customer's own discount (code, loyalty)", () => {
    expect(basketLineStruck({ unitCents: 4495, qty: 2, cutCents: 500 }, null)).toBe(8990);
  });
});

describe("promotionBadgeShown", () => {
  it("hides a unit price cut's badge when the database announces no reduction", () => {
    expect(promotionBadgeShown(book({ promotions: [promo()] }).offerFor(product, NOW)?.promotion ?? null)).toBe(false);
    expect(promotionBadgeShown(book({ promotions: [promo()], references: [ref()] }).offerFor(product, NOW)?.promotion ?? null)).toBe(true);
    expect(promotionBadgeShown(book({ promotions: [promo({ type: "gift", percent_off: null })] }).offerFor(product, NOW)?.promotion ?? null)).toBe(true);
    expect(promotionBadgeShown(null)).toBe(false);
  });
});
