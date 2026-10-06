import { describe, expect, it } from "vitest";
import { buildCheckoutRequest, EMPTY_CHECKOUT_FORM, invalidFields, type CheckoutForm } from "./checkoutForm";
import type { CartLine } from "./cartLines";
import { isCheckoutSessionId, isClientSecret, readCheckoutAnswer } from "./api";

const form: CheckoutForm = {
  firstName: " Camille ",
  lastName: "Roussel",
  email: "camille@studio.fr ",
  street: "14 rue des Capucins",
  postalCode: "69001",
  city: "Lyon",
  country: "fr",
};
const line: CartLine = {
  id: "gel::",
  productId: "gel",
  dbProductId: "0b5e6a52-7d0c-4a55-9d7e-1f6f6b2c1a01",
  name: "Gel",
  image: "",
  unitPrice: 1900,
  currency: "EUR",
  qty: 2,
};

describe("checkout form", () => {
  it("lists what is missing, delivery included", () => {
    expect(invalidFields(EMPTY_CHECKOUT_FORM, null)).toEqual(["firstName", "lastName", "email", "street", "postalCode", "city", "shipping"]);
    expect(invalidFields(form, "rate")).toEqual([]);
    expect(invalidFields({ ...form, email: "camille@" }, "rate")).toEqual(["email"]);
  });

  it("builds a request without any amount", () => {
    const request = buildCheckoutRequest([line], form, "rate-id", "fr");
    expect(request).toEqual({
      items: [{ product_id: line.dbProductId, variant_id: null, quantity: 2 }],
      email: "camille@studio.fr",
      address: {
        first_name: "Camille",
        last_name: "Roussel",
        address_line1: "14 rue des Capucins",
        postal_code: "69001",
        city: "Lyon",
        country_code: "FR",
      },
      shipping_rate_id: "rate-id",
      locale: "fr",
    });
    expect(JSON.stringify(request)).not.toMatch(/price|total|amount/);
    expect(buildCheckoutRequest([{ ...line, dbProductId: undefined }], form, "rate-id", "fr")).toBeNull();
  });
});

describe("checkout answers", () => {
  const payment = {
    status: "payment",
    client_secret: "cs_test_a1B2c3D4e5F6g7H8_secret_Zz9Yy8Xx7Ww6",
    publishable_key: "pk_test_51AbCdEfGhIjKlMn",
    order_number: "GT-100042",
    amount_due: 4290,
    currency: "EUR",
    expires_at: "2026-10-07T13:00:00.000Z",
  };

  it("opens the payment step from a well-formed answer only", () => {
    expect(readCheckoutAnswer(payment)).toEqual({
      kind: "payment",
      payment: {
        clientSecret: payment.client_secret,
        publishableKey: payment.publishable_key,
        orderNumber: "GT-100042",
        amountDue: 4290,
        currency: "EUR",
        expiresAt: Date.parse(payment.expires_at),
      },
    });
    const broken = [
      { client_secret: "cs_test_a1B2c3D4e5F6g7H8" },
      { publishable_key: "sk_test_51AbCdEfGhIjKlMn" },
      // A live key cannot open a test session.
      { publishable_key: "pk_live_51AbCdEfGhIjKlMn" },
      { amount_due: 42.9 },
      { amount_due: 0 },
      { currency: "eur" },
      { expires_at: "soon" },
    ];
    for (const patch of broken) {
      expect(readCheckoutAnswer({ ...payment, ...patch })).toEqual({ kind: "error", error: "payment_unavailable" });
    }
    expect(readCheckoutAnswer({ status: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_1" })).toEqual({ kind: "error", error: "server_error" });
  });

  it("recognises client secrets", () => {
    expect(isClientSecret(payment.client_secret)).toBe(true);
    expect(isClientSecret("pi_123_secret_abcdefghij")).toBe(false);
    expect(isClientSecret(null)).toBe(false);
  });

  it("maps codes it knows and nothing else", () => {
    expect(readCheckoutAnswer({ error: "out_of_stock" })).toEqual({ kind: "error", error: "out_of_stock" });
    expect(readCheckoutAnswer({ error: "relation orders does not exist" })).toEqual({ kind: "error", error: "server_error" });
    expect(readCheckoutAnswer({ status: "paid", order_number: "GT-100042" })).toEqual({ kind: "paid", orderNumber: "GT-100042" });
  });

  it("recognises Checkout Session ids", () => {
    expect(isCheckoutSessionId("cs_test_a1B2c3D4e5F6g7H8")).toBe(true);
    expect(isCheckoutSessionId("cs_test_{CHECKOUT_SESSION_ID}")).toBe(false);
    expect(isCheckoutSessionId(null)).toBe(false);
  });
});

describe("checkout with gift cards", () => {
  const card: CartLine = {
    id: "gift-card::a",
    productId: "carte-cadeau",
    dbProductId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    name: "Carte cadeau",
    image: "",
    unitPrice: 5000,
    currency: "EUR",
    qty: 1,
    giftCard: { recipientEmail: "jade@example.fr", design: "sparkle" },
  };

  it("asks for no delivery when nothing is shipped", () => {
    expect(invalidFields(form, null, false)).toEqual([]);
    expect(invalidFields(form, null, true)).toEqual(["shipping"]);
  });

  it("sends no rate for a gift-card-only basket and the codes typed", () => {
    const request = buildCheckoutRequest([card], form, null, "en", ["GT-AAAA-BBBB-CCCC"]);
    expect(request?.shipping_rate_id).toBeNull();
    expect(request?.gift_card_codes).toEqual(["GT-AAAA-BBBB-CCCC"]);
    const item = request?.items[0];
    expect(item && "gift_card" in item ? item.gift_card?.amount_minor : null).toBe(5000);
    expect(buildCheckoutRequest([line], form, "rate", "fr")).not.toHaveProperty("gift_card_codes");
    expect(buildCheckoutRequest([line], form, "rate", "fr")).not.toHaveProperty("use_loyalty_reward");
    expect(buildCheckoutRequest([line], form, "rate", "fr", [], true)?.use_loyalty_reward).toBe(true);
  });

  it("knows the code for gift card details refused by the database", () => {
    expect(readCheckoutAnswer({ error: "gift_card_details_invalid" })).toEqual({ kind: "error", error: "gift_card_details_invalid" });
    expect(readCheckoutAnswer({ error: "gift_card_invalid" })).toEqual({ kind: "error", error: "gift_card_invalid" });
  });
});

describe("course lines in the checkout request", () => {
  const course: CartLine = {
    id: "course::3a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d",
    productId: "pose-professionnelle",
    courseId: "3a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d",
    name: "Pose professionnelle",
    image: "",
    unitPrice: 34900,
    currency: "EUR",
    qty: 1,
  };

  it("sends the course id only, and no rate when nothing is shipped", () => {
    const request = buildCheckoutRequest([course], form, null, "fr");
    expect(request?.items).toEqual([{ course_id: course.courseId, quantity: 1 }]);
    expect(request?.shipping_rate_id).toBeNull();
    expect(JSON.stringify(request)).not.toContain("34900");
  });

  it("knows the course refusals", () => {
    expect(readCheckoutAnswer({ error: "account_required" })).toEqual({ kind: "error", error: "account_required" });
    expect(readCheckoutAnswer({ error: "course_owned" })).toEqual({ kind: "error", error: "course_owned" });
  });
});
