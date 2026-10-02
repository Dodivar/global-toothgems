import { describe, expect, it } from "vitest";
import { addCourseToLines, addGiftCardToLines, addToLines, courseLineId, hasCourse, cartCount, cartSubtotal, checkoutItems, MAX_LINE_QTY, needsShipping, setLineQty, shippableSubtotal, type CartLine } from "./cartLines";

const gel: Omit<CartLine, "id"> = {
  productId: "gel-de-suivi",
  dbProductId: "0b5e6a52-7d0c-4a55-9d7e-1f6f6b2c1a01",
  name: "Gel",
  image: "/g.jpg",
  unitPrice: 1990,
  currency: "EUR",
  qty: 1,
};
const strass = { ...gel, productId: "strass", dbProductId: "p2", variantId: "v-ss6", variant: "SS6 · 20", unitPrice: 1250 };

describe("cart lines", () => {
  it("merges the same product and variant, keeps variants apart", () => {
    let lines = addToLines([], gel);
    lines = addToLines(lines, { ...gel, qty: 2 });
    lines = addToLines(lines, strass);
    lines = addToLines(lines, { ...strass, variantId: "v-ss10", variant: "SS10 · 20" });
    expect(lines.map((l) => [l.id, l.qty])).toEqual([
      ["gel-de-suivi::", 3],
      ["strass::v-ss6", 1],
      ["strass::v-ss10", 1],
    ]);
  });

  it("adds up in integer minor units (no float drift)", () => {
    const lines = addToLines(addToLines([], { ...gel, unitPrice: 10, qty: 3 }), { ...strass, unitPrice: 20, qty: 1 });
    expect(cartSubtotal(lines)).toBe(50);
    expect(cartCount(lines)).toBe(4);
    const many = Array.from({ length: 10 }, (_, i) => ({ ...gel, id: `x${i}`, unitPrice: 10, qty: 1 }));
    expect(cartSubtotal(many)).toBe(100); // 0.1 × 10 in floats would not be exactly 1
  });

  it("caps quantities to what the checkout accepts and removes at zero", () => {
    let lines = addToLines([], { ...gel, qty: MAX_LINE_QTY });
    lines = addToLines(lines, gel);
    expect(lines[0].qty).toBe(MAX_LINE_QTY);
    expect(setLineQty(lines, lines[0].id, 0)).toEqual([]);
  });

  it("sends identifiers and quantities only, or nothing for a line outside the database catalogue", () => {
    const lines = addToLines(addToLines([], { ...gel, qty: 2 }), strass);
    expect(checkoutItems(lines)).toEqual([
      { product_id: gel.dbProductId, variant_id: null, quantity: 2 },
      { product_id: "p2", variant_id: "v-ss6", quantity: 1 },
    ]);
    const { dbProductId: _db, ...mockLine } = gel;
    expect(checkoutItems(addToLines(lines, { ...mockLine, productId: "aurora-heart" }))).toBeNull();
  });
});

describe("gift card lines", () => {
  const giftLine = {
    productId: "carte-cadeau",
    dbProductId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    name: "Carte cadeau",
    image: "",
    unitPrice: 5000,
    currency: "EUR",
    giftCard: { recipientEmail: "jade@example.fr", recipientName: "Jade", design: "noir", message: "" },
  };

  it("keeps one line per card, quantity fixed at 1", () => {
    let lines = addGiftCardToLines([], giftLine, "a");
    lines = addGiftCardToLines(lines, giftLine, "b");
    expect(lines.map((l) => [l.id, l.qty])).toEqual([
      ["gift-card::a", 1],
      ["gift-card::b", 1],
    ]);
    expect(setLineQty(lines, "gift-card::a", 4)[0].qty).toBe(1);
  });

  it("ships nothing and leaves gift cards out of delivery thresholds", () => {
    const cards = addGiftCardToLines([], giftLine, "a");
    expect(needsShipping(cards)).toBe(false);
    const mixed = addToLines(cards, { ...gel, qty: 2 });
    expect(needsShipping(mixed)).toBe(true);
    expect(shippableSubtotal(mixed)).toBe(3980);
    expect(cartSubtotal(mixed)).toBe(8980);
  });

  it("sends the card's details and amount in minor units", () => {
    const items = checkoutItems(addGiftCardToLines([], { ...giftLine, giftCard: { ...giftLine.giftCard, deliverAt: "2026-12-24T08:00:00.000Z" } }, "a"));
    expect(items).toEqual([
      {
        product_id: giftLine.dbProductId,
        variant_id: null,
        quantity: 1,
        gift_card: {
          amount_minor: 5000,
          recipient_email: "jade@example.fr",
          recipient_name: "Jade",
          sender_name: null,
          message: null,
          design: "noir",
          deliver_at: "2026-12-24T08:00:00.000Z",
        },
      },
    ]);
  });
});

describe("course lines", () => {
  const course = {
    courseId: "3a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d",
    productId: "pose-professionnelle",
    name: "Pose professionnelle",
    image: "",
    unitPrice: 34900,
    currency: "EUR",
  };

  it("adds a course once, one seat, whatever is asked", () => {
    const once = addCourseToLines([], course);
    const twice = addCourseToLines(once, course);
    expect(twice).toEqual(once);
    expect(once[0]).toMatchObject({ id: courseLineId(course.courseId), qty: 1 });
    expect(setLineQty(once, once[0].id, 4)[0].qty).toBe(1);
    expect(setLineQty(once, once[0].id, 0)).toEqual([]);
  });

  it("is neither shipped nor counted for delivery thresholds", () => {
    const lines = addCourseToLines(addToLines([], gel), course);
    expect(hasCourse(lines)).toBe(true);
    expect(needsShipping(addCourseToLines([], course))).toBe(false);
    expect(needsShipping(lines)).toBe(true);
    expect(shippableSubtotal(lines)).toBe(1990);
    expect(cartSubtotal(lines)).toBe(1990 + 34900);
  });

  it("goes to the checkout as a course id, after nothing else", () => {
    const lines = addCourseToLines(addToLines([], gel), course);
    expect(checkoutItems(lines)).toEqual([
      { product_id: gel.dbProductId, variant_id: null, quantity: 1 },
      { course_id: course.courseId, quantity: 1 },
    ]);
  });
});
