import {
  USER_ROLES,
  USER_STATUSES,
  roleRank,
  userName,
  type AdminUser,
  type UserRole,
  type UserStatus,
} from "../data/adminUsers";
import { PAGE_SIZES, paginate, type Page } from "./adminOrderFilters";

/**
 * Search, filters, sorting and paging for the Users workspace.
 *
 * Pure functions over the user list, with the state held in the URL — the same
 * split as `adminCustomerFilters.ts`, so a filtered list of users is a link a
 * colleague can open and the back button returns to it. The query keys are
 * French, like every other admin route.
 */

export const USER_ACTIVITY_PRESETS = ["all", "last24h", "last7", "last30", "inactive30", "never"] as const;
export type UserActivityPreset = (typeof USER_ACTIVITY_PRESETS)[number];

export const USER_SORT_KEYS = [
  "nameAsc",
  "nameDesc",
  "activityDesc",
  "activityAsc",
  "createdDesc",
  "createdAsc",
  "roleDesc",
  "roleAsc",
] as const;
export type UserSortKey = (typeof USER_SORT_KEYS)[number];

export const DEFAULT_USER_SORT: UserSortKey = "nameAsc";
export const DEFAULT_USER_PAGE_SIZE = 10;

export interface UserFilters {
  search: string;
  role: UserRole | "all";
  status: UserStatus | "all";
  activity: UserActivityPreset;
  sort: UserSortKey;
  page: number;
  pageSize: number;
}

export const USER_PARAM = {
  search: "q",
  role: "role",
  status: "statut",
  activity: "activite",
  sort: "tri",
  page: "page",
  pageSize: "par",
  /** The user whose profile drawer is open. */
  user: "utilisateur",
} as const;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function readUserFilters(params: URLSearchParams): UserFilters {
  const rawSize = Number(params.get(USER_PARAM.pageSize));
  return {
    search: params.get(USER_PARAM.search) ?? "",
    role: oneOf(params.get(USER_PARAM.role), [...USER_ROLES, "all"] as const, "all"),
    status: oneOf(params.get(USER_PARAM.status), [...USER_STATUSES, "all"] as const, "all"),
    activity: oneOf(params.get(USER_PARAM.activity), USER_ACTIVITY_PRESETS, "all"),
    sort: oneOf(params.get(USER_PARAM.sort), USER_SORT_KEYS, DEFAULT_USER_SORT),
    page: Math.max(1, Number(params.get(USER_PARAM.page)) || 1),
    pageSize: (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_USER_PAGE_SIZE,
  };
}

/** Filters in force, the search term included. Sorting and paging are not filters. */
export function activeUserFilterCount(filters: UserFilters): number {
  return (
    (filters.search.trim() ? 1 : 0) +
    (filters.role !== "all" ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.activity !== "all" ? 1 : 0)
  );
}

/** Accent- and case-insensitive, so "ines" finds Inès. */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function matchesActivity(user: AdminUser, preset: UserActivityPreset, now: number): boolean {
  if (preset === "all") return true;
  if (preset === "never") return user.lastActiveAt === null;
  if (user.lastActiveAt === null) return false;
  const age = now - new Date(user.lastActiveAt).getTime();
  switch (preset) {
    case "last24h":
      return age <= DAY;
    case "last7":
      return age <= 7 * DAY;
    case "last30":
      return age <= 30 * DAY;
    case "inactive30":
      return age > 30 * DAY;
    default:
      return true;
  }
}

function compare(a: AdminUser, b: AdminUser, sort: UserSortKey): number {
  const byName = userName(a).localeCompare(userName(b), "fr", { sensitivity: "base" });
  // A never-active user sorts after everyone when looking for the most recent
  // activity, and before everyone when looking for the stalest — "never" is the
  // stalest there is.
  const activity = (u: AdminUser) => (u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : -Infinity);
  switch (sort) {
    case "nameAsc":
      return byName;
    case "nameDesc":
      return -byName;
    case "activityDesc":
      return activity(b) - activity(a) || byName;
    case "activityAsc":
      return activity(a) - activity(b) || byName;
    case "createdDesc":
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || byName;
    case "createdAsc":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || byName;
    case "roleDesc":
      return roleRank(b.role) - roleRank(a.role) || byName;
    case "roleAsc":
      return roleRank(a.role) - roleRank(b.role) || byName;
  }
}

export function applyUserFilters(users: AdminUser[], filters: UserFilters, now = Date.now()): AdminUser[] {
  const term = normalize(filters.search);
  return users
    .filter((user) => {
      if (term && !normalize(`${userName(user)} ${user.email}`).includes(term)) return false;
      if (filters.role !== "all" && user.role !== filters.role) return false;
      if (filters.status !== "all" && user.status !== filters.status) return false;
      return matchesActivity(user, filters.activity, now);
    })
    .sort((a, b) => compare(a, b, filters.sort));
}

export function paginateUsers(users: AdminUser[], filters: UserFilters): Page<AdminUser> {
  return paginate(users, filters.page, filters.pageSize);
}

export interface UserMetrics {
  total: number;
  active: number;
  invited: number;
  managers: number;
  administrators: number;
}

/** Counted from the same list the table renders, so a change moves both. */
export function userMetrics(users: AdminUser[]): UserMetrics {
  return {
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    invited: users.filter((u) => u.status === "invited").length,
    managers: users.filter((u) => u.role === "manager").length,
    administrators: users.filter((u) => u.role === "administrator").length,
  };
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Why an action is unavailable for this user, or null when it is available.
 *
 * Two rules, both about not locking the team out of its own back office: you
 * cannot demote, suspend or delete yourself, and the last active administrator
 * cannot be demoted, suspended or deleted by anyone. The UI disables the action
 * and says why, rather than hiding it — a missing button teaches nothing, a
 * disabled one with a reason teaches the rule.
 *
 * A UX courtesy only. The server must enforce the same rules.
 */
export type GuardReason = "self" | "lastAdmin" | null;

export function guardFor(user: AdminUser, users: AdminUser[], currentUserId: string): GuardReason {
  if (user.id === currentUserId) return "self";
  if (user.role === "administrator" && user.status === "active") {
    const activeAdmins = users.filter((u) => u.role === "administrator" && u.status === "active").length;
    if (activeAdmins <= 1) return "lastAdmin";
  }
  return null;
}
