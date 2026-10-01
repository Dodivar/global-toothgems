import { describe, expect, it } from "vitest";
import { buildCheckoutRequest, EMPTY_CHECKOUT_FORM, invalidFields, type CheckoutForm } from "./checkoutForm";
import type { CartLine } from "./cartLines";
import { isCheckoutSessionId, isStripeCheckoutUrl, readCheckoutAnswer } from "./api";

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
  it("follows Stripe's hosted page only", () => {
    expect(readCheckoutAnswer({ status: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_1" })).toEqual({
      kind: "redirect",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    });
    expect(readCheckoutAnswer({ status: "redirect", url: "https://evil.example/pay" })).toEqual({ kind: "error", error: "server_error" });
    expect(isStripeCheckoutUrl("http://checkout.stripe.com/x")).toBe(false);
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
