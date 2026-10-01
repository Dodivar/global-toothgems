/**
 * Administration users — the people who work *in* the back office: the UI
 * vocabulary of the Users workspace (roles, statuses, teams) and its display
 * helpers. No data lives here: the team is read from Supabase
 * (`staff_directory()`, see `lib/adminUsers.tsx`) and mapped by
 * `lib/adminUserMapping.ts`.
 *
 * Nothing in this file is authorization. Roles, ranks and permissions are
 * decided by Postgres (`roles`, `role_permissions`, `private.has_permission()`,
 * `private.guard_profile_update()`); the UI only reads them to choose what to
 * offer (`AGENTS.md` §7).
 */

/* -------------------------------------------------------------------------- */
/* Roles, statuses, teams                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The staff roles, ordered from least to most access — the order the role
 * picker shows. Database keys: `viewer`, `manager`, `admin`.
 */
export const USER_ROLES = ["readOnly", "manager", "administrator"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * `invited` until the first sign-in; `suspended` and `deactivated` come from
 * the profile (`staff_directory()`). Deactivated accounts exist in the
 * database (`profiles.status`) but the back office never deactivates anyone:
 * it suspends. They are shown as they are and can be reactivated.
 */
export const USER_STATUSES = ["active", "invited", "suspended", "deactivated"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** `staff_profiles.team`; database keys are snake_case (`customer_care`). */
export const USER_TEAMS = ["leadership", "operations", "academy", "customerCare", "marketing", "finance"] as const;
export type UserTeam = (typeof USER_TEAMS)[number];

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  /** `roles.rank`: who may manage whom (a member acts on ranks ≤ their own). */
  rank: number;
  status: UserStatus;
  /** Internal, single language (`staff_profiles.job_title`). */
  jobTitle: string;
  /** Null for an account without staff details (e.g. bootstrapped by SQL). */
  team: UserTeam | null;
  /** ISO timestamp. */
  createdAt: string;
  /** Last sign-in (ISO), or null for an invitation that has never been accepted. */
  lastActiveAt: string | null;
  /** ISO timestamp of the invitation, when there was one. */
  invitedAt: string | null;
  /** Name of the team member who invited them, when known. */
  invitedBy: string | null;
  twoFactor: boolean;
}

/** One permission of the matrix, as `permissions` stores it. */
export interface PermissionInfo {
  /** Database key, e.g. `manage_users`. */
  key: string;
  /** English name from the database: the fallback label for a key the UI has no translation for. */
  name: string;
}

/** Which role holds which permission — read from `role_permissions`, never written by the app. */
export interface PermissionMatrix {
  permissions: PermissionInfo[];
  granted: Record<UserRole, ReadonlySet<string>>;
  rank: Record<UserRole, number>;
}

/** What moving from one role to another adds and removes, in matrix order. */
export function permissionDiff(matrix: PermissionMatrix, from: UserRole, to: UserRole): { gained: string[]; lost: string[] } {
  const before = matrix.granted[from];
  const after = matrix.granted[to];
  const keys = matrix.permissions.map((p) => p.key);
  return {
    gained: keys.filter((k) => after.has(k) && !before.has(k)),
    lost: keys.filter((k) => before.has(k) && !after.has(k)),
  };
}

/** Order of a role in the picker (0 = least access). Display only; ranks come from the database. */
export function roleOrder(role: UserRole): number {
  return USER_ROLES.indexOf(role);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function userName(user: Pick<AdminUser, "firstName" | "lastName"> & { email?: string }): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email || "—";
}

export function userInitials(user: Pick<AdminUser, "firstName" | "lastName">): string {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() || "?";
}

/**
 * A stable pastel for the avatar, chosen from the id — the same rule as the
 * customer avatars, so a person keeps one colour across the table, the card,
 * the drawer and a reload. Fuchsia is left out: on this page it is kept for
 * the "you" marker, and a fuchsia avatar beside it would blur the one accent
 * the page spends on purpose.
 */
const AVATAR_TINTS = [
  "var(--gt-blue-200)",
  "var(--gt-emerald-300)",
  "var(--gt-blue-300)",
  "var(--gt-amber-400)",
  "var(--gt-ink-200)",
  "var(--gt-blue-100)",
];

export function userAvatarTint(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i) * (i + 1);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

/** Plausible email check — the real one is the server's (Edge Function `invite-staff-member`). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
