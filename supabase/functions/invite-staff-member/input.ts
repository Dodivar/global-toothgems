/**
 * Strict validation of what the back office sends to `invite-staff-member`.
 *
 * Three actions, each with an exact set of keys: anything unexpected (unknown
 * key, wrong type, out-of-range value, a role that is not a staff role)
 * rejects the whole request. Pure: no Deno or network API, so it is
 * unit-tested with `deno test`.
 */

/** Staff roles (`roles.is_staff`), lowest to highest rank. `customer` is never a target. */
export const STAFF_ROLES = ["viewer", "manager", "admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** `staff_profiles.team` CHECK values. */
export const STAFF_TEAMS = ["leadership", "operations", "academy", "customer_care", "marketing", "finance"] as const;
export type StaffTeam = (typeof STAFF_TEAMS)[number];

export interface InviteInput {
  action: "invite";
  email: string;
  first_name: string;
  last_name: string;
  role: StaffRole;
  team: StaffTeam;
  job_title: string | null;
}

export interface MemberActionInput {
  action: "resend" | "cancel";
  user_id: string;
}

export type StaffInviteInput = InviteInput | MemberActionInput;

export type ValidationResult = { ok: true; value: StaffInviteInput } | { ok: false; field: string };

/** Same bounds as the columns: profiles names ≤ 100, staff_profiles.job_title ≤ 120. */
export const MAX_NAME = 100;
export const MAX_JOB_TITLE = 120;
export const MAX_EMAIL = 254;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Control characters have no business in a name or a job title.
// deno-lint-ignore no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const INVITE_KEYS = new Set(["action", "email", "first_name", "last_name", "role", "team", "job_title"]);
const MEMBER_KEYS = new Set(["action", "user_id"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || CONTROL_RE.test(trimmed)) return null;
  return trimmed;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseStaffInviteInput(body: unknown): ValidationResult {
  if (!isRecord(body)) return { ok: false, field: "body" };
  const action = body.action;

  if (action === "resend" || action === "cancel") {
    const unknown = Object.keys(body).find((key) => !MEMBER_KEYS.has(key));
    if (unknown) return { ok: false, field: unknown };
    if (typeof body.user_id !== "string" || !UUID_RE.test(body.user_id)) return { ok: false, field: "user_id" };
    return { ok: true, value: { action, user_id: body.user_id.toLowerCase() } };
  }

  if (action !== "invite") return { ok: false, field: "action" };
  const unknown = Object.keys(body).find((key) => !INVITE_KEYS.has(key));
  if (unknown) return { ok: false, field: unknown };

  const email = text(body.email, MAX_EMAIL)?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) return { ok: false, field: "email" };
  const firstName = text(body.first_name, MAX_NAME);
  if (!firstName) return { ok: false, field: "first_name" };
  const lastName = text(body.last_name, MAX_NAME);
  if (!lastName) return { ok: false, field: "last_name" };
  const role = oneOf(body.role, STAFF_ROLES);
  if (!role) return { ok: false, field: "role" };
  const team = oneOf(body.team, STAFF_TEAMS);
  if (!team) return { ok: false, field: "team" };

  let jobTitle: string | null = null;
  if (body.job_title !== undefined && body.job_title !== null && body.job_title !== "") {
    jobTitle = text(body.job_title, MAX_JOB_TITLE);
    if (!jobTitle) return { ok: false, field: "job_title" };
  }

  return {
    ok: true,
    value: { action, email, first_name: firstName, last_name: lastName, role, team, job_title: jobTitle },
  };
}
