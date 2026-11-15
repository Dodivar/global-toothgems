import { describe, expect, it } from "vitest";
import { parseBookingCreation } from "./glowbookBookingCreation";

const ID = "0f8b6b8e-4f0a-4b5e-9a5b-3f1c2d3e4f50";
const NOW = 1_800_000_000_000;

describe("parseBookingCreation", () => {
  it("reads a recent choice", () => {
    expect(parseBookingCreation(JSON.stringify({ id: ID.toUpperCase(), name: "My smile", at: NOW - 1000 }), NOW)).toEqual({ id: ID, name: "My smile" });
  });

  it("forgets a stale, future or malformed choice", () => {
    expect(parseBookingCreation(JSON.stringify({ id: ID, name: "x", at: NOW - 25 * 3600_000 }), NOW)).toBeNull();
    expect(parseBookingCreation(JSON.stringify({ id: ID, name: "x", at: NOW + 3600_000 }), NOW)).toBeNull();
    expect(parseBookingCreation(JSON.stringify({ id: "not-a-uuid", at: NOW }), NOW)).toBeNull();
    expect(parseBookingCreation("{", NOW)).toBeNull();
    expect(parseBookingCreation(null, NOW)).toBeNull();
  });

  it("keeps a missing name empty and cuts a long one", () => {
    expect(parseBookingCreation(JSON.stringify({ id: ID, at: NOW }), NOW)?.name).toBe("");
    expect(parseBookingCreation(JSON.stringify({ id: ID, name: "a".repeat(300), at: NOW }), NOW)?.name).toHaveLength(120);
  });
});
