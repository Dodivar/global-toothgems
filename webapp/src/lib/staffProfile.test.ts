import { describe, expect, it } from "vitest";
import { isActiveStaff } from "./staffProfile";

describe("isActiveStaff", () => {
  it("lets an active profile with a staff role in", () => {
    expect(isActiveStaff({ status: "active", roles: { is_staff: true } })).toBe(true);
    expect(isActiveStaff({ status: "active", roles: [{ is_staff: true }] })).toBe(true);
  });

  it("refuses customers, suspended staff and unreadable profiles", () => {
    expect(isActiveStaff({ status: "active", roles: { is_staff: false } })).toBe(false);
    expect(isActiveStaff({ status: "suspended", roles: { is_staff: true } })).toBe(false);
    expect(isActiveStaff({ status: "active", roles: null })).toBe(false);
    expect(isActiveStaff({ status: "active", roles: [] })).toBe(false);
    expect(isActiveStaff(null)).toBe(false);
  });
});
