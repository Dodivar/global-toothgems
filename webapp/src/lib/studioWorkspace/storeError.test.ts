import { describe, expect, it } from "vitest";
import { limitKind, StudioStoreError } from "./repository";
import { storeError } from "./supabaseRepository";

describe("storeError", () => {
  it("maps the plan limit refusal (GTL01, decision 113) by kind", () => {
    const creations = storeError({ code: "GTL01", message: "studio plan limit reached: creations (15)" });
    const groups = storeError({ code: "GTL01", message: "studio plan limit reached: gem_groups (3)" });
    expect(creations.code).toBe("limitReached");
    expect(limitKind(creations)).toBe("creations");
    expect(limitKind(groups)).toBe("gemGroups");
  });

  it("keeps the other refusals apart", () => {
    expect(storeError({ code: "42501" }).code).toBe("accessDenied");
    expect(limitKind(storeError({ code: "42501" }))).toBeNull();
    expect(limitKind(new Error("GTL01"))).toBeNull();
    expect(limitKind(new StudioStoreError("storage"))).toBeNull();
  });
});
