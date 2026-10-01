import {
  USER_ROLES,
  USER_STATUSES,
  USER_TEAMS,
  type AdminUser,
  type PermissionMatrix,
  type UserRole,
  type UserStatus,
  type UserTeam,
} from "../data/adminUsers";

/**
 * Rows of the Users workspace ↔ the shapes the screen shows. Pure: no
 * Supabase client, no React, so every rule here is unit-tested
 * (`adminUserMapping.test.ts`).
 *
 * The database is the vocabulary's source: roles `viewer` / `manager` /
 * `admin` (the UI says read only / manager / administrator), teams in
 * snake_case, permissions and their grants read from `permissions` and
 * `role_permissions`. Nothing here decides who may do what.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

const ROLE_FROM_DB: Record<string, UserRole> = { viewer: "readOnly", manager: "manager", admin: "administrator" };
const ROLE_TO_DB: Record<UserRole, "viewer" | "manager" | "admin"> = { readOnly: "viewer", manager: "manager", administrator: "admin" };

/** The UI role of a staff role key, or null for `customer` or a role the UI does not know yet. */
export function roleFromDb(key: string | null | undefined): UserRole | null {
  return key && Object.hasOwn(ROLE_FROM_DB, key) ? ROLE_FROM_DB[key] : null;
}

export function roleToDb(role: UserRole): "viewer" | "manager" | "admin" {
  return ROLE_TO_DB[role];
}

/** `customer_care` ↔ `customerCare`; the other teams have the same key on both sides. */
export function teamFromDb(key: string | null | undefined): UserTeam | null {
  if (!key) return null;
  const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return (USER_TEAMS as readonly string[]).includes(camel) ? (camel as UserTeam) : null;
}

export function teamToDb(team: UserTeam): string {
  return team.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * `staff_directory()` statuses are the UI's. A status this screen does not
 * know yet is shown as suspended — the most restrictive reading — rather than
 * as active.
 */
export function statusFromDb(value: string | null | undefined): UserStatus {
  return value && (USER_STATUSES as readonly string[]).includes(value) ? (value as UserStatus) : "suspended";
}

/* -------------------------------------------------------------------------- */
/* Directory                                                                  */
/* -------------------------------------------------------------------------- */

/** One row of `staff_directory()` (left-joined columns may be null whatever the generated types say). */
export interface StaffDirectoryRow {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  role_rank: number;
  status: string;
  job_title: string | null;
  team: string | null;
  invited_by: string | null;
  invited_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  two_factor: boolean | null;
}

/**
 * The team as the screen lists it. Rows whose role the UI has no word for
 * (a staff role added by a later migration) are left out rather than shown
 * under a wrong label; the inviter's name is resolved from the same list.
 */
export function mapStaffDirectory(rows: StaffDirectoryRow[]): AdminUser[] {
  const names = new Map(
    rows.map((row) => [row.user_id, [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.email || null]),
  );
  const users: AdminUser[] = [];
  for (const row of rows) {
    const role = roleFromDb(row.role);
    if (!role) continue;
    users.push({
      id: row.user_id,
      firstName: row.first_name?.trim() ?? "",
      lastName: row.last_name?.trim() ?? "",
      email: row.email ?? "",
      role,
      rank: row.role_rank,
      status: statusFromDb(row.status),
      jobTitle: row.job_title?.trim() ?? "",
      team: teamFromDb(row.team),
      createdAt: row.created_at,
      lastActiveAt: row.last_sign_in_at,
      invitedAt: row.invited_at,
      invitedBy: row.invited_by ? (names.get(row.invited_by) ?? null) : null,
      twoFactor: row.two_factor === true,
    });
  }
  return users;
}

/* -------------------------------------------------------------------------- */
/* Permission matrix                                                          */
/* -------------------------------------------------------------------------- */

export interface RoleRow {
  key: string;
  rank: number;
  is_staff: boolean;
}

export interface PermissionRow {
  key: string;
  name: string;
}

export interface RolePermissionRow {
  role_key: string;
  permission_key: string;
}

/**
 * The matrix as the database grants it. Permissions are ordered by how many
 * roles hold them (shared rows first, so the differences between roles sit at
 * the bottom where the eye lands last), then by key. Null when a staff role
 * the UI shows is missing from `roles`: the matrix would be wrong, not partial.
 */
export function mapPermissionMatrix(
  roles: RoleRow[],
  permissions: PermissionRow[],
  grants: RolePermissionRow[],
): PermissionMatrix | null {
  const rank = {} as Record<UserRole, number>;
  const granted = {} as Record<UserRole, Set<string>>;
  for (const role of USER_ROLES) {
    const row = roles.find((r) => r.key === roleToDb(role) && r.is_staff);
    if (!row) return null;
    rank[role] = row.rank;
    granted[role] = new Set();
  }
  for (const grant of grants) {
    const role = roleFromDb(grant.role_key);
    if (role) granted[role].add(grant.permission_key);
  }
  const holders = (key: string) => USER_ROLES.filter((role) => granted[role].has(key)).length;
  const ordered = [...permissions].sort((a, b) => holders(b.key) - holders(a.key) || a.key.localeCompare(b.key));
  return { permissions: ordered.map(({ key, name }) => ({ key, name })), granted, rank };
}

/** `manage_users` → `manageUsers`: the i18n key of a permission. */
export function permissionLabelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** What the add and edit forms write. */
export interface UserDraft {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  jobTitle: string;
  /** "" until a team is chosen. */
  team: UserTeam | "";
}

/** The body of the `invite` action of the Edge Function `invite-staff-member`. */
export function inviteBody(draft: UserDraft) {
  if (!draft.team) throw new Error("inviteBody: a team is required");
  return {
    action: "invite" as const,
    email: draft.email.trim().toLowerCase(),
    first_name: draft.firstName.trim(),
    last_name: draft.lastName.trim(),
    role: roleToDb(draft.role),
    team: teamToDb(draft.team),
    job_title: draft.jobTitle.trim() || null,
  };
}

/** The rows an edit writes: names (+ role when it changed) on `profiles`, details on `staff_profiles`. */
export function editPatches(user: AdminUser, draft: UserDraft) {
  if (!draft.team) throw new Error("editPatches: a team is required");
  const profile: { first_name: string; last_name: string; role?: string } = {
    first_name: draft.firstName.trim(),
    last_name: draft.lastName.trim(),
  };
  if (draft.role !== user.role) profile.role = roleToDb(draft.role);
  return {
    profile,
    staff: { user_id: user.id, team: teamToDb(draft.team), job_title: draft.jobTitle.trim() || null },
  };
}

/**
 * Why a write did not land, as the screen words it. The database's own
 * refusals (RLS, `guard_profile_update()`, `guard_staff_profile()`) and the
 * Edge Function's codes map to the same few messages; nothing else of the
 * error reaches the screen.
 */
export type UserWriteError =
  | "forbidden"
  | "rankForbidden"
  | "self"
  | "alreadyMember"
  | "accountUnavailable"
  | "notPending"
  | "notFound"
  | "rateLimited"
  | "invalid"
  | "unavailable";

export interface WriteFailure {
  code?: string;
  message?: string;
}

/** A PostgREST / Postgres error from a write under the caller's RLS. */
export function writeErrorOf(error: WriteFailure): UserWriteError {
  const message = error.message ?? "";
  if (error.code === "42501") {
    if (/your own role or status/.test(message)) return "self";
    if (/above your own/.test(message)) return "rankForbidden";
    return "forbidden";
  }
  // `.single()` on an UPDATE that RLS let touch no row.
  if (error.code === "PGRST116") return "forbidden";
  if (error.code === "23514" || error.code === "22023" || error.code === "22001") return "invalid";
  return "unavailable";
}

const FUNCTION_ERRORS: Record<string, UserWriteError> = {
  invalid_request: "invalid",
  unauthorized: "forbidden",
  forbidden: "forbidden",
  rank_forbidden: "rankForbidden",
  already_member: "alreadyMember",
  account_unavailable: "accountUnavailable",
  not_pending: "notPending",
  not_found: "notFound",
  rate_limited: "rateLimited",
};

/** The `{ error }` code answered by `invite-staff-member`. */
export function functionErrorOf(code: unknown): UserWriteError {
  return typeof code === "string" && Object.hasOwn(FUNCTION_ERRORS, code) ? FUNCTION_ERRORS[code] : "unavailable";
}
