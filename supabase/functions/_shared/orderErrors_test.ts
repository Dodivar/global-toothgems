import { assertEquals } from "jsr:@std/assert@1";
import { checkoutErrorCode } from "./orderErrors.ts";

Deno.test("every refusal of a gift card used as payment is the same generic code", () => {
  for (const error of [
    { code: "P0002", message: "create_order: gift card not usable" },
    { code: "P0001", message: "gift card is not usable" },
    { code: "P0001", message: "gift card balance insufficient" },
    { code: "22023", message: "create_order: at most 5 gift cards per order" },
  ]) {
    assertEquals(checkoutErrorCode(error), "gift_card_invalid", error.message);
  }
});

Deno.test("a gift card being bought: details refused, or not on sale", () => {
  for (const message of [
    "create_order: gift card amount not allowed",
    "create_order: gift card details are incomplete or invalid",
    "create_order: one gift card per line",
    "create_order: delivery date not allowed",
  ]) {
    assertEquals(checkoutErrorCode({ code: "22023", message }), "gift_card_details_invalid", message);
  }
  assertEquals(checkoutErrorCode({ code: "P0002", message: "create_order: gift cards are not on sale" }), "unavailable");
  assertEquals(checkoutErrorCode({ code: "22023", message: "create_order: gift cards are sold in EUR" }), "unavailable");
});

Deno.test("other errors keep their meaning", () => {
  assertEquals(checkoutErrorCode({ code: "P0001", message: "create_order: insufficient stock for X" }), "out_of_stock");
  assertEquals(checkoutErrorCode({ code: "22023", message: "create_order: shipping address and rate are required" }), "shipping_unavailable");
  assertEquals(checkoutErrorCode({ code: "22023", message: "create_order: promotion code WELCOME is not valid" }), "promotion_code_invalid");
  assertEquals(checkoutErrorCode({ code: "XX000", message: "boom" }), "server_error");
});
