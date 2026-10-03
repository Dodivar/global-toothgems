import { assert, assertEquals } from "jsr:@std/assert@1";
import { courseOrderItems, orderItems, parseCheckoutInput } from "./checkoutInput.ts";
import { toDecimalString } from "./money.ts";

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
    { use_loyalty_reward: "yes" },
    { use_loyalty_reward: 1 },
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

const GIFT = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const giftLine = (card: Record<string, unknown> = {}) => ({
  product_id: GIFT,
  quantity: 1,
  gift_card: { amount_minor: 5000, recipient_email: " Jade@Example.fr ", ...card },
});

Deno.test("accepts gift card lines, one per recipient, without a delivery rate", () => {
  const result = parseCheckoutInput({
    ...valid(),
    shipping_rate_id: null,
    items: [
      giftLine({ recipient_name: " Jade ", message: "Joyeux\r\nanniversaire", design: "noir", deliver_at: "2026-12-24T09:00:00+01:00" }),
      giftLine({ recipient_email: "lea@example.fr" }),
    ],
  });
  assert(result.ok);
  assertEquals(result.value.shipping_rate_id, null);
  assertEquals(result.value.items[0].gift_card, {
    amount_minor: 5000,
    recipient_email: "jade@example.fr",
    recipient_name: "Jade",
    sender_name: null,
    message: "Joyeux\nanniversaire",
    design: "noir",
    deliver_at: "2026-12-24T09:00:00+01:00",
  });
  assertEquals(result.value.items[1].gift_card?.design, null);
});

Deno.test("rejects malformed gift card lines", () => {
  const bad = [
    { ...giftLine(), quantity: 2 },
    { ...giftLine(), variant_id: V1 },
    { product_id: GIFT, quantity: 1, gift_card: "50" },
    giftLine({ amount_minor: 0 }),
    giftLine({ amount_minor: 49.5 }),
    giftLine({ amount_minor: "5000" }),
    giftLine({ amount_minor: 10_000_001 }),
    giftLine({ recipient_email: "nobody" }),
    giftLine({ recipient_name: "x".repeat(101) }),
    giftLine({ sender_name: "Ma\u0000non" }),
    giftLine({ message: "x".repeat(1001) }),
    giftLine({ message: "bell\u0007" }),
    giftLine({ design: "gold" }),
    giftLine({ deliver_at: "24/12/2026" }),
    giftLine({ deliver_at: "2026-12-24" }),
    giftLine({ code: "GT-AAAA-BBBB-CCCC" }),
    giftLine({ balance: 100 }),
  ];
  for (const line of bad) assert(!parseCheckoutInput({ ...valid(), items: [line] }).ok, JSON.stringify(line).slice(0, 100));
});

Deno.test("gift card lines become create_order() lines with a decimal amount", () => {
  const result = parseCheckoutInput({ ...valid(), items: [valid().items[0], giftLine({ amount_minor: 2550, design: "mint" }), giftLine()] });
  assert(result.ok);
  const lines = orderItems(result.value.items, toDecimalString);
  assertEquals(lines[0], { product_id: P1, variant_id: null, quantity: 2 });
  assertEquals(lines[1].amount, "25.50");
  assertEquals(lines[1].gift_card?.design, "mint");
  assertEquals(lines[1].quantity, 1);
  assert(!("amount_minor" in (lines[1].gift_card ?? {})));
  assert(!("design" in (lines[2].gift_card ?? {})), "the shop's default design is left to create_order()");
});

const C1 = "3a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const C2 = "4b0c9d8e-7f6a-4b5c-8d3e-2f1a0b9c8d7e";

Deno.test("course lines: one seat per course, kept apart from the shop lines", () => {
  const result = parseCheckoutInput({
    ...valid(),
    items: [valid().items[0], { course_id: C1.toUpperCase(), quantity: 1 }, { course_id: C2 }],
  });
  assert(result.ok);
  assertEquals(result.value.items, [{ product_id: P1, variant_id: null, quantity: 2 }]);
  assertEquals(result.value.course_ids, [C1, C2]);
  assertEquals(courseOrderItems(result.value.course_ids), [
    { course_id: C1, quantity: 1 },
    { course_id: C2, quantity: 1 },
  ]);
});

Deno.test("a basket of courses only needs no delivery rate", () => {
  const result = parseCheckoutInput({ ...valid(), items: [{ course_id: C1, quantity: 1 }], shipping_rate_id: null });
  assert(result.ok);
  assertEquals(result.value.items, []);
  assertEquals(result.value.course_ids, [C1]);
  assertEquals(result.value.shipping_rate_id, null);
});

Deno.test("course lines refuse anything but an id and a single seat", () => {
  const bad: unknown[] = [
    { course_id: "fondation" },
    { course_id: C1, quantity: 2 },
    { course_id: C1, quantity: "1" },
    { course_id: C1, quantity: 1, unit_price: 1 },
    { course_id: C1, product_id: P1, quantity: 1 },
    { course_id: C1, variant_id: null },
  ];
  for (const line of bad) assert(!parseCheckoutInput({ ...valid(), items: [line] }).ok, JSON.stringify(line));
  assert(!parseCheckoutInput({ ...valid(), items: [{ course_id: C1 }, { course_id: C1.toUpperCase() }] }).ok, "same course twice");
});

Deno.test("the loyalty reward is a request that defaults to off", () => {
  const off = parseCheckoutInput(valid());
  assert(off.ok);
  assertEquals(off.value.use_loyalty_reward, false);
  const on = parseCheckoutInput({ ...valid(), use_loyalty_reward: true });
  assert(on.ok);
  assertEquals(on.value.use_loyalty_reward, true);
});
