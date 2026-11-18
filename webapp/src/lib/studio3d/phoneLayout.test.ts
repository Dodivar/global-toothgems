import { describe, expect, it } from "vitest";
import { phoneLayoutOf } from "./phoneLayout";

describe("the Studio's phone layout", () => {
  it("is null on anything but a phone, whichever way it is held", () => {
    expect(phoneLayoutOf(false, false)).toBeNull();
    expect(phoneLayoutOf(false, true)).toBeNull();
  });
  it("names how a phone is held", () => {
    expect(phoneLayoutOf(true, false)).toBe("portrait");
    expect(phoneLayoutOf(true, true)).toBe("landscape");
  });
});
