import { describe, expect, it } from "vitest";
import { addDays, zoneOffset } from "./calendar";
import { countryName } from "./countryName";
import { foldText } from "./foldText";
import { initialsOf } from "./initials";
import { oneOf } from "./oneOf";

describe("foldText", () => {
  it("removes accents and case", () => {
    expect(foldText("Éclat Hygiène")).toBe("eclat hygiene");
  });
});

describe("oneOf", () => {
  const SORTS = ["newest", "oldest"] as const;
  it("keeps an allowed value", () => {
    expect(oneOf("oldest", SORTS, "newest")).toBe("oldest");
  });
  it("falls back on anything else", () => {
    expect(oneOf("price", SORTS, "newest")).toBe("newest");
    expect(oneOf(null, SORTS, "newest")).toBe("newest");
    expect(oneOf(3, SORTS, "newest")).toBe("newest");
  });
});

describe("initialsOf", () => {
  it("takes the first and last words", () => {
    expect(initialsOf("inès de la tour")).toBe("IT");
    expect(initialsOf("Inès")).toBe("I");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("calendar", () => {
  it("moves across months and years", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("reads a zone's offset, summer time included", () => {
    expect(zoneOffset(Date.UTC(2026, 0, 15, 12), "Europe/Paris")).toBe(60 * 60 * 1000);
    expect(zoneOffset(Date.UTC(2026, 6, 15, 12), "Europe/Paris")).toBe(2 * 60 * 60 * 1000);
  });
});

describe("countryName", () => {
  it("names a country in the UI language", () => {
    expect(countryName("FR", "fr")).toBe("France");
    expect(countryName("DE", "en-IE")).toBe("Germany");
  });
  it("falls back on the code", () => {
    expect(countryName("", "fr")).toBe("");
  });
});
