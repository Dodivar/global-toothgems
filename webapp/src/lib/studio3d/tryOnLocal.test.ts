import { describe, expect, it } from "vitest";
import { recordsToErase, sourceKey, TRY_ON_KEEP_MAX, TRY_ON_KEEP_MS } from "./tryOnLocal";

const NOW = 1_800_000_000_000;
const run = (id: string, userId: string, ageMs: number) => ({ id, userId, createdAt: NOW - ageMs });

describe("sourceKey", () => {
  it("names the creation whatever object the caller passed", () => {
    expect(sourceKey({ kind: "own", creationId: "c1" })).toBe("own:c1");
    expect(sourceKey({ kind: "share", token: "t" })).toBe("share:t");
    expect(sourceKey({ kind: "glowbook", handle: "ana", itemId: "i" })).toBe("glowbook:ana/i");
    expect(sourceKey({ kind: "own", creationId: "c1" })).toBe(sourceKey({ creationId: "c1", kind: "own" }));
  });
});

describe("recordsToErase", () => {
  it("erases everything when nobody is signed in", () => {
    expect(recordsToErase([run("a", "u1", 0), run("b", "u2", 0)], null, NOW).sort()).toEqual(["a", "b"]);
  });

  it("erases another account's runs, keeps the signed-in account's", () => {
    expect(recordsToErase([run("a", "u1", 0), run("b", "u2", 0)], "u1", NOW)).toEqual(["b"]);
  });

  it("erases runs older than 24 hours, and runs dated in the future", () => {
    const records = [run("fresh", "u1", TRY_ON_KEEP_MS - 1), run("old", "u1", TRY_ON_KEEP_MS + 1), run("future", "u1", -3_600_000)];
    expect(recordsToErase(records, "u1", NOW).sort()).toEqual(["future", "old"]);
  });

  it("keeps only the newest runs past the maximum", () => {
    const records = Array.from({ length: TRY_ON_KEEP_MAX + 2 }, (_, i) => run(`r${i}`, "u1", i * 1000));
    expect(recordsToErase(records, "u1", NOW).sort()).toEqual([`r${TRY_ON_KEEP_MAX}`, `r${TRY_ON_KEEP_MAX + 1}`].sort());
  });
});
