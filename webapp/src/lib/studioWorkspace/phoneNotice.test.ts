import { describe, expect, it } from "vitest";
import { isPhoneScreen } from "./phoneNotice";

describe("isPhoneScreen", () => {
  it("is a phone: touch and a small screen, held either way", () => {
    expect(isPhoneScreen(true, 390, 844)).toBe(true);
    expect(isPhoneScreen(true, 844, 390)).toBe(true);
    expect(isPhoneScreen(true, 360, 800)).toBe(true);
  });
  it("is not a tablet", () => {
    expect(isPhoneScreen(true, 744, 1133)).toBe(false);
    expect(isPhoneScreen(true, 820, 1180)).toBe(false);
  });
  it("is not a desktop, however narrow its window", () => {
    expect(isPhoneScreen(false, 1920, 1080)).toBe(false);
    expect(isPhoneScreen(false, 390, 844)).toBe(false);
  });
  it("ignores an unknown screen size", () => {
    expect(isPhoneScreen(true, 0, 0)).toBe(false);
  });
});
