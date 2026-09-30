import { describe, expect, it } from "vitest";
import { isMemberSpacePath } from "./memberSpace";

describe("isMemberSpacePath", () => {
  it("matches the account and every screen under it", () => {
    expect(isMemberSpacePath("/compte")).toBe(true);
    expect(isMemberSpacePath("/compte/commandes")).toBe(true);
    expect(isMemberSpacePath("/compte/communaute/canal/general")).toBe(true);
  });

  it("does not match a path that merely starts with the same letters", () => {
    expect(isMemberSpacePath("/comptes")).toBe(false);
    expect(isMemberSpacePath("/boutique")).toBe(false);
    expect(isMemberSpacePath("/")).toBe(false);
  });
});
