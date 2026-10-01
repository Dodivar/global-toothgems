import { describe, expect, it } from "vitest";
import type { AdminUser } from "../data/adminUsers";
import { permissionDiff } from "../data/adminUsers";
import {
  editPatches,
  functionErrorOf,
  inviteBody,
  mapPermissionMatrix,
  mapStaffDirectory,
  permissionLabelKey,
  roleFromDb,
  roleToDb,
  statusFromDb,
  teamFromDb,
  teamToDb,
  writeErrorOf,
  type StaffDirectoryRow,
} from "./adminUserMapping";

const row = (overrides: Partial<StaffDirectoryRow> = {}): StaffDirectoryRow => ({
  user_id: "u-1",
  email: "ines@example.com",
  first_name: "Inès",
  last_name: "Benali",
  role: "manager",
  role_rank: 20,
  status: "active",
  job_title: " Responsable Academy ",
  team: "customer_care",
  invited_by: null,
  invited_at: null,
  created_at: "2026-09-01T10:00:00Z",
  last_sign_in_at: "2026-09-30T08:00:00Z",
  two_factor: true,
  ...overrides,
});

describe("vocabulary", () => {
  it("maps the database roles to the UI's and back", () => {
    expect(roleFromDb("viewer")).toBe("readOnly");
    expect(roleFromDb("admin")).toBe("administrator");
    expect(roleFromDb("customer")).toBeNull();
    expect(roleFromDb("toString")).toBeNull();
    expect(roleToDb("readOnly")).toBe("viewer");
    expect(roleToDb("administrator")).toBe("admin");
  });

  it("maps teams in both directions and rejects unknown ones", () => {
    expect(teamFromDb("customer_care")).toBe("customerCare");
    expect(teamFromDb("academy")).toBe("academy");
    expect(teamFromDb("sales")).toBeNull();
    expect(teamFromDb(null)).toBeNull();
    expect(teamToDb("customerCare")).toBe("customer_care");
  });

  it("reads an unknown status as suspended, never as active", () => {
    expect(statusFromDb("invited")).toBe("invited");
    expect(statusFromDb("deactivated")).toBe("deactivated");
    expect(statusFromDb("archived")).toBe("suspended");
  });
});

describe("mapStaffDirectory", () => {
  it("maps a row, resolving the inviter's name from the same list", () => {
    const users = mapStaffDirectory([
      row({ user_id: "u-1", invited_by: "u-2", invited_at: "2026-09-01T09:00:00Z" }),
      row({ user_id: "u-2", first_name: "Camille", last_name: "Dubois", role: "admin", role_rank: 30, team: null, job_title: null }),
    ]);
    expect(users[0]).toEqual({
      id: "u-1",
      firstName: "Inès",
      lastName: "Benali",
      email: "ines@example.com",
      role: "manager",
      rank: 20,
      status: "active",
      jobTitle: "Responsable Academy",
      team: "customerCare",
      createdAt: "2026-09-01T10:00:00Z",
      lastActiveAt: "2026-09-30T08:00:00Z",
      invitedAt: "2026-09-01T09:00:00Z",
      invitedBy: "Camille Dubois",
      twoFactor: true,
    });
    // Bootstrapped account: no staff details.
    expect(users[1]).toMatchObject({ role: "administrator", team: null, jobTitle: "", invitedBy: null });
  });

  it("leaves out a role the UI has no word for, and an inviter outside the list", () => {
    const users = mapStaffDirectory([row({ role: "support", role_rank: 15 }), row({ user_id: "u-3", invited_by: "gone" })]);
    expect(users.map((u) => u.id)).toEqual(["u-3"]);
    expect(users[0].invitedBy).toBeNull();
  });

  it("keeps an invitation without names readable", () => {
    const [user] = mapStaffDirectory([row({ first_name: null, last_name: null, status: "invited", last_sign_in_at: null, two_factor: null })]);
    expect(user).toMatchObject({ firstName: "", lastName: "", status: "invited", lastActiveAt: null, twoFactor: false });
  });
});

describe("mapPermissionMatrix", () => {
  const roles = [
    { key: "customer", rank: 0, is_staff: false },
    { key: "viewer", rank: 10, is_staff: true },
    { key: "manager", rank: 20, is_staff: true },
    { key: "admin", rank: 30, is_staff: true },
  ];
  const permissions = [
    { key: "manage_settings", name: "Manage settings" },
    { key: "manage_users", name: "Manage users" },
    { key: "view_users", name: "View users" },
    { key: "moderate_reviews", name: "Moderate reviews" },
  ];
  const grants = [
    { role_key: "viewer", permission_key: "view_users" },
    { role_key: "manager", permission_key: "view_users" },
    { role_key: "manager", permission_key: "manage_users" },
    { role_key: "manager", permission_key: "moderate_reviews" },
    { role_key: "admin", permission_key: "view_users" },
    { role_key: "admin", permission_key: "manage_users" },
    { role_key: "admin", permission_key: "moderate_reviews" },
    { role_key: "admin", permission_key: "manage_settings" },
  ];

  it("reads grants and ranks from the database, shared permissions first", () => {
    const matrix = mapPermissionMatrix(roles, permissions, grants)!;
    expect(matrix.permissions.map((p) => p.key)).toEqual(["view_users", "manage_users", "moderate_reviews", "manage_settings"]);
    expect([...matrix.granted.readOnly]).toEqual(["view_users"]);
    expect(matrix.granted.administrator.has("manage_settings")).toBe(true);
    expect(matrix.granted.manager.has("manage_settings")).toBe(false);
    expect(matrix.rank).toEqual({ readOnly: 10, manager: 20, administrator: 30 });
    expect(permissionDiff(matrix, "manager", "readOnly")).toEqual({ gained: [], lost: ["manage_users", "moderate_reviews"] });
    expect(permissionDiff(matrix, "manager", "administrator")).toEqual({ gained: ["manage_settings"], lost: [] });
  });

  it("is null when a staff role is missing (a wrong matrix is worse than none)", () => {
    expect(mapPermissionMatrix(roles.filter((r) => r.key !== "manager"), permissions, grants)).toBeNull();
  });

  it("derives the translation key of a permission", () => {
    expect(permissionLabelKey("manage_users")).toBe("manageUsers");
    expect(permissionLabelKey("moderate_reviews")).toBe("moderateReviews");
  });
});

describe("writes", () => {
  const user: AdminUser = mapStaffDirectory([row()])[0];

  it("builds the invitation body in the database's vocabulary", () => {
    expect(
      inviteBody({ firstName: " Nora ", lastName: "Martin", email: " Nora@Example.COM ", role: "administrator", jobTitle: " ", team: "customerCare" }),
    ).toEqual({
      action: "invite",
      email: "nora@example.com",
      first_name: "Nora",
      last_name: "Martin",
      role: "admin",
      team: "customer_care",
      job_title: null,
    });
    expect(() => inviteBody({ firstName: "N", lastName: "M", email: "n@x.io", role: "manager", jobTitle: "", team: "" })).toThrow();
  });

  it("writes the role only when it changed", () => {
    const draft = { firstName: "Inès", lastName: "Benali", email: user.email, role: "manager" as const, jobTitle: "Lead", team: "academy" as const };
    expect(editPatches(user, draft)).toEqual({
      profile: { first_name: "Inès", last_name: "Benali" },
      staff: { user_id: "u-1", team: "academy", job_title: "Lead" },
    });
    expect(editPatches(user, { ...draft, role: "readOnly" }).profile.role).toBe("viewer");
  });

  it("maps database refusals to messages without keeping their text", () => {
    expect(writeErrorOf({ code: "42501", message: "profiles: you cannot change your own role or status" })).toBe("self");
    expect(writeErrorOf({ code: "42501", message: "profiles: you cannot manage or assign a role above your own" })).toBe("rankForbidden");
    expect(writeErrorOf({ code: "42501", message: "profiles: managing team members requires manage_users" })).toBe("forbidden");
    expect(writeErrorOf({ code: "PGRST116", message: "0 rows" })).toBe("forbidden");
    expect(writeErrorOf({ code: "23514" })).toBe("invalid");
    expect(writeErrorOf({ code: "08006", message: "connection failure" })).toBe("unavailable");
  });

  it("maps the Edge Function's codes, unknown ones to a generic failure", () => {
    expect(functionErrorOf("rank_forbidden")).toBe("rankForbidden");
    expect(functionErrorOf("already_member")).toBe("alreadyMember");
    expect(functionErrorOf("server_error")).toBe("unavailable");
    expect(functionErrorOf("constructor")).toBe("unavailable");
    expect(functionErrorOf(undefined)).toBe("unavailable");
  });
});
