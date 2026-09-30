import { assert, assertEquals } from "jsr:@std/assert@1";
import { parseCheckoutInput } from "./checkoutInput.ts";

const P1 = "0b5e6a52-7d0c-4a55-9d7e-1f6f6b2c1a01";
const V1 = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const RATE = "5f0e9d8c-7b6a-4958-8473-625140392817";

const valid = () => ({
  items: [
    { product_id: P1, variant_id: null, quantity: 2 },
    { product_id: P1, variant_id: V1, quantity: 1 },
  ],
  email: "  Camille@Example.com ",
  address: {
    first_name: "Camille",
    last_name: "Roussel",
    address_line1: "14 rue des Capucins",
    postal_code: "69001",
    city: "Lyon",
    country_code: "fr",
  },
  shipping_rate_id: RATE,
  locale: "fr",
});

Deno.test("accepts a well-formed basket and normalises it", () => {
  const result = parseCheckoutInput({ ...valid(), promotion_codes: [" welcome15 ", "WELCOME15"] });
  assert(result.ok);
  assertEquals(result.value.email, "camille@example.com");
  assertEquals(result.value.address.country_code, "FR");
  assertEquals(result.value.promotion_codes, ["WELCOME15"]);
  assertEquals(result.value.gift_card_codes, []);
  assertEquals(result.value.customer_note, null);
  assertEquals(result.value.items[1].variant_id, V1);
});

Deno.test("never accepts an amount, total or currency from the browser", () => {
  for (const extra of [{ total: 1 }, { amount: 1 }, { currency: "EUR" }, { price: 0 }]) {
    const result = parseCheckoutInput({ ...valid(), ...extra });
    assert(!result.ok, JSON.stringify(extra));
  }
  const line = { ...valid().items[0], unit_price: 1 };
  assert(!parseCheckoutInput({ ...valid(), items: [line] }).ok);
});

Deno.test("rejects malformed lines", () => {
  const bad = [
    [],
    [{ product_id: "aurora-heart", quantity: 1 }],
    [{ product_id: P1, quantity: 0 }],
    [{ product_id: P1, quantity: 1.5 }],
    [{ product_id: P1, quantity: 1001 }],
    [{ product_id: P1, quantity: "2" }],
    [{ product_id: P1, variant_id: "x", quantity: 1 }],
    [{ product_id: P1, quantity: 1 }, { product_id: P1.toUpperCase(), variant_id: null, quantity: 1 }],
    Array.from({ length: 101 }, () => ({ product_id: crypto.randomUUID(), quantity: 1 })),
  ];
  for (const items of bad) assert(!parseCheckoutInput({ ...valid(), items }).ok, JSON.stringify(items).slice(0, 80));
});

Deno.test("rejects bad contact details, rate, locale and codes", () => {
  const cases: Record<string, unknown>[] = [
    { email: "not-an-email" },
    { email: `${"a".repeat(250)}@x.fr` },
    { address: { ...valid().address, city: "" } },
    { address: { ...valid().address, first_name: "Ca\u0000mille" } },
    { address: { ...valid().address, country_code: "FRA" } },
    { address: { ...valid().address, postal_code: "<script>" } },
    { address: { ...valid().address, admin: true } },
    { shipping_rate_id: "standard" },
    { locale: "de" },
    { promotion_codes: ["A", "B", "C", "D"] },
    { promotion_codes: ["bad code"] },
    { gift_card_codes: ["GT-1234"] },
    { customer_note: "x".repeat(1001) },
  ];
  for (const patch of cases) assert(!parseCheckoutInput({ ...valid(), ...patch }).ok, JSON.stringify(patch).slice(0, 80));
  assert(!parseCheckoutInput(null).ok);
  assert(!parseCheckoutInput([]).ok);
});

Deno.test("gift card codes are upper-cased", () => {
  const result = parseCheckoutInput({ ...valid(), gift_card_codes: ["gt-abcd-efgh-jkmn"] });
  assert(result.ok);
  assertEquals(result.value.gift_card_codes, ["GT-ABCD-EFGH-JKMN"]);
});
