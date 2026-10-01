import { describe, expect, it } from "vitest";
import type { AdminUser } from "../data/adminUsers";
import { blocksEditing, guardFor } from "./adminUserFilters";

const member = (overrides: Partial<AdminUser>): AdminUser => ({
  id: "u",
  firstName: "A",
  lastName: "B",
  email: "a@example.com",
  role: "manager",
  rank: 20,
  status: "active",
  jobTitle: "",
  team: "operations",
  createdAt: "2026-09-01T00:00:00Z",
  lastActiveAt: null,
  invitedAt: null,
  invitedBy: null,
  twoFactor: false,
  ...overrides,
});

const admin = member({ id: "admin", role: "administrator", rank: 30 });
const manager = member({ id: "manager" });
const viewer = member({ id: "viewer", role: "readOnly", rank: 10 });
const team = [admin, manager, viewer];

describe("guardFor (the database's rules, read ahead for the UI)", () => {
  it("offers nothing without manage_users", () => {
    expect(guardFor(viewer, team, { currentUserId: "x", canManage: false, callerRank: 10 })).toBe("noPermission");
  });

  it("never offers changes to one's own role or status", () => {
    expect(guardFor(manager, team, { currentUserId: "manager", canManage: true, callerRank: 20 })).toBe("self");
  });

  it("a manager cannot act on an administrator, but can on a peer or below", () => {
    const asManager = { currentUserId: "other", canManage: true, callerRank: 20 };
    expect(guardFor(admin, [...team, member({ id: "admin2", role: "administrator", rank: 30 })], asManager)).toBe("rank");
    expect(guardFor(manager, team, asManager)).toBeNull();
    expect(guardFor(viewer, team, asManager)).toBeNull();
  });

  it("keeps the last active administrator in place", () => {
    const asAdmin = { currentUserId: "other-admin", canManage: true, callerRank: 30 };
    expect(guardFor(admin, team, asAdmin)).toBe("lastAdmin");
    expect(guardFor(admin, [...team, member({ id: "admin2", role: "administrator", rank: 30 })], asAdmin)).toBeNull();
  });

  it("only permission and rank block editing names and team", () => {
    expect(blocksEditing("noPermission")).toBe(true);
    expect(blocksEditing("rank")).toBe(true);
    expect(blocksEditing("self")).toBe(false);
    expect(blocksEditing("lastAdmin")).toBe(false);
    expect(blocksEditing(null)).toBe(false);
  });
});
