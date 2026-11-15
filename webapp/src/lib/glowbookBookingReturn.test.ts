import { describe, expect, it } from "vitest";
import { bookingReturnPath, readBookingReturn, withoutBookingReturn } from "./glowbookBookingReturn";

const ITEM = "0b6f3c1e-2a4d-4c8e-9f10-1234567890ab";
const SLOT = "2026-11-20T09:00:00+00:00";

describe("glowbook booking return", () => {
  it("carries the design and the hour through the address", () => {
    const path = bookingReturnPath("/fr/glowbook/dodi", "?utm_source=ig", { itemId: ITEM, slot: SLOT });
    expect(path.startsWith("/fr/glowbook/dodi?")).toBe(true);
    const search = path.slice(path.indexOf("?"));
    expect(readBookingReturn(search)).toEqual({ itemId: ITEM, slot: SLOT });
    expect(new URLSearchParams(search).get("utm_source")).toBe("ig");
  });

  it("opens with nothing chosen when the visitor chose nothing", () => {
    const path = bookingReturnPath("/en/glowbook/dodi", "", { itemId: null, slot: null });
    expect(path).toBe("/en/glowbook/dodi?reserver=1");
    expect(readBookingReturn("?reserver=1")).toEqual({ itemId: null, slot: null });
  });

  it("replaces an earlier choice instead of repeating it", () => {
    const path = bookingReturnPath("/p", `?reserver=1&creation=${ITEM}`, { itemId: null, slot: SLOT });
    const params = new URLSearchParams(path.slice(path.indexOf("?")));
    expect(params.getAll("reserver")).toEqual(["1"]);
    expect(params.has("creation")).toBe(false);
  });

  it("asks for nothing without the flag and drops malformed values", () => {
    expect(readBookingReturn(`?creation=${ITEM}`)).toBeNull();
    expect(readBookingReturn("?reserver=1&creation=abc&creneau=never")).toEqual({ itemId: null, slot: null });
  });

  it("removes only its own parameters", () => {
    expect(withoutBookingReturn(`?reserver=1&creation=${ITEM}&creneau=x&utm_source=ig`)).toBe("?utm_source=ig");
    expect(withoutBookingReturn("?reserver=1")).toBe("");
  });
});
