import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { toDecimalString, toMinorUnits } from "./money.ts";

Deno.test("numeric ↔ minor units without float arithmetic", () => {
  assertEquals(toMinorUnits("19.99"), 1999);
  assertEquals(toMinorUnits(42.9), 4290);
  assertEquals(toMinorUnits("0.10"), 10);
  assertEquals(toMinorUnits("1"), 100);
  assertEquals(toDecimalString(4290), "42.90");
  assertEquals(toDecimalString(5), "0.05");
  assertEquals(toDecimalString(0), "0.00");
  assertThrows(() => toMinorUnits("1.999"));
  assertThrows(() => toMinorUnits("-1"));
  assertThrows(() => toDecimalString(1.5));
});
