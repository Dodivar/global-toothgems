import { describe, expect, it } from "vitest";
import type { Product } from "../../data/products";
import { buildCourseOffers, COURSE_KIT_SLUG, sellable } from "./courseOffers";
import type { PriceBook } from "../catalog/productOffers";

const COURSE = "course-row-id";

const product = (over: Partial<Product> & Pick<Product, "id" | "dbId">): Product => ({
  name: { fr: over.id, en: over.id },
  subtitle: { fr: "", en: "" },
  price: 10,
  currency: "EUR",
  rating: 0,
  reviewCount: 0,
  image: `/${over.id}.jpg`,
  cat: "materiel",
  family: null,
  material: "",
  availability: "in_stock",
  ...over,
});

const kit = product({ id: COURSE_KIT_SLUG, dbId: "kit", price: 340 });
const valise = product({ id: "valise", dbId: "valise", price: 49.9, availability: "out_of_stock" });
const pack = product({
  id: "pro-pack",
  dbId: "pack",
  price: 830,
  availability: "out_of_stock",
  inclusions: [
    { kind: "course", courseId: COURSE, title: { fr: "Masterclass", en: "Masterclass" }, slugs: { fr: "masterclass" } },
    { kind: "studio", plan: "artist", months: 3 },
  ],
});
const bundles = new Map([["pack", ["kit", "valise"]]]);

describe("buildCourseOffers", () => {
  it("finds the packs that open the course, with their articles and Studio months", () => {
    const offers = buildCourseOffers(COURSE, [kit, valise, pack], bundles);
    expect(offers.packs).toHaveLength(1);
    const [found] = offers.packs;
    expect(found).toMatchObject({ id: "pro-pack", dbId: "pack", priceCents: 83000, currency: "EUR", availability: "out_of_stock" });
    expect(found.components.map((c) => [c.id, c.priceCents])).toEqual([
      [COURSE_KIT_SLUG, 34000],
      ["valise", 4990],
    ]);
    expect(found.studio).toEqual({ kind: "studio", plan: "artist", months: 3 });
    expect(sellable(found)).toBe(false);
  });

  it("offers the kit only when a pack of this course holds it", () => {
    expect(buildCourseOffers(COURSE, [kit, valise, pack], bundles).kit).toMatchObject({ id: COURSE_KIT_SLUG, priceCents: 34000 });
    expect(buildCourseOffers("another-course", [kit, valise, pack], bundles)).toEqual({ kit: null, packs: [] });
    expect(buildCourseOffers(COURSE, [kit, valise, pack], new Map([["pack", ["valise"]]])).kit).toBeNull();
  });

  it("leaves out a component the shop does not sell, and products with variants", () => {
    const offers = buildCourseOffers(COURSE, [valise, pack], bundles);
    expect(offers.kit).toBeNull();
    expect(offers.packs[0].components.map((c) => c.id)).toEqual(["valise"]);
    const withVariants = { ...pack, variants: [{ id: "v1", name: { fr: "A", en: "A" } }] } as unknown as Product;
    expect(buildCourseOffers(COURSE, [kit, withVariants], bundles).packs).toEqual([]);
  });

  it("prices items as their product pages do (Omnibus reference)", () => {
    const book: PriceBook = {
      item: (dbId: string | undefined) => (dbId === "pack" ? { reference: { priceCents: 79900, struckCents: 83000 }, startedAt: null, endsAt: null } : null),
    } as unknown as PriceBook;
    expect(buildCourseOffers(COURSE, [kit, valise, pack], bundles, book).packs[0].priceCents).toBe(79900);
  });
});
