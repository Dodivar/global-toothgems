/*
 * Who may enter the back office (`/admin`): an active profile whose role is a
 * staff role (`roles.is_staff`). One rule for the browser (`adminAuth.tsx`)
 * and for the proxy's and the server's check of the back-office pages
 * (`proxy.ts`, `app/_zones/guard.ts`), which answer 404 to anyone else.
 * Navigation only: RLS and `private.is_staff()` decide every read and write.
 */

/** The profile columns the rule reads, as a PostgREST select. */
export const STAFF_PROFILE_COLUMNS = "status, roles ( is_staff )";

export interface StaffProfileRow {
  status: string | null;
  roles: { is_staff: boolean } | { is_staff: boolean }[] | null;
}

/** Whether a profile row (the caller's own, read under RLS) is an active staff member's. */
export function isActiveStaff(row: StaffProfileRow | null | undefined): boolean {
  if (!row || row.status !== "active") return false;
  const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return role?.is_staff === true;
}
