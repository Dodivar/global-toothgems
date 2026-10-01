import { isSupabaseConfigured, supabase } from "./supabase/client";

/**
 * Who holds a course, for the back office (`/admin/formations/:id/acces`).
 *
 * Until checkout sells courses (phase D), staff with `manage_training` give a
 * course to a member by hand: `admin_grant_course()` finds the member by exact
 * e-mail, `admin_revoke_course_entitlement()` withdraws the access, and
 * `admin_course_entitlements()` lists the holders with how far they are. All
 * three check the permission in the database and every change is audited
 * (`audit_logs`). Without Supabase (prototype) the list lives in the page.
 */

export type EntitlementSource = "purchase" | "manual_grant" | "bundle" | "promotion";

export interface CourseHolder {
  id: string;
  email: string;
  name: string | null;
  source: EntitlementSource;
  note: string | null;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  grantedBy: string | null;
  stepsDone: number;
  completedAt: string | null;
  certificateCode: string | null;
}

export type AccessErrorKind = "memberNotFound" | "alreadyHeld" | "notPublished" | "invalidExpiry" | "forbidden" | "network";

export class CourseAccessError extends Error {
  readonly kind: AccessErrorKind;
  constructor(kind: AccessErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

/** The database's refusal, as one of the kinds the screen explains. */
export function accessErrorKind(error: { code?: string; message?: string }): AccessErrorKind {
  const message = error.message ?? "";
  if (message.includes("member_not_found")) return "memberNotFound";
  if (message.includes("already_held")) return "alreadyHeld";
  if (message.includes("course_not_published")) return "notPublished";
  if (message.includes("invalid_expiry")) return "invalidExpiry";
  if (error.code === "42501" || message.includes("permission denied")) return "forbidden";
  return "network";
}

/** A plausible e-mail, checked before asking the server (which checks again). */
export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Active now: not revoked and not expired. */
export function isActiveHolder(holder: CourseHolder, now = new Date()): boolean {
  return !holder.revokedAt && (!holder.expiresAt || new Date(holder.expiresAt) > now);
}

interface HolderRow {
  id: string;
  email: string;
  display_name: string | null;
  source: string;
  note: string | null;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  granted_by_name: string | null;
  steps_done: number;
  completed_at: string | null;
  certificate_code: string | null;
}

export function rowToHolder(row: HolderRow): CourseHolder {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    source: row.source as EntitlementSource,
    note: row.note,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    grantedBy: row.granted_by_name,
    stepsDone: row.steps_done,
    completedAt: row.completed_at,
    certificateCode: row.certificate_code,
  };
}

export interface GrantInput {
  email: string;
  /** End of access (ISO), or null for no end. */
  expiresAt: string | null;
  note: string;
}

export interface CourseAccessBackend {
  list: (courseId: string) => Promise<CourseHolder[]>;
  grant: (courseId: string, input: GrantInput) => Promise<void>;
  revoke: (entitlementId: string) => Promise<void>;
}

function fail(error: { code?: string; message?: string }): never {
  const kind = accessErrorKind(error);
  if (kind === "network") console.error("Course access:", error);
  throw new CourseAccessError(kind);
}

const supabaseBackend: CourseAccessBackend = {
  list: async (courseId) => {
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("admin_course_entitlements", { p_course_id: courseId });
    if (error) fail(error);
    return ((data ?? []) as HolderRow[]).map(rowToHolder);
  },
  grant: async (courseId, input) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_grant_course", {
      p_email: input.email.trim(),
      p_course_id: courseId,
      p_expires_at: input.expiresAt ?? undefined,
      p_note: input.note.trim() || undefined,
    });
    if (error) fail(error);
  },
  revoke: async (entitlementId) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_revoke_course_entitlement", { p_entitlement_id: entitlementId });
    if (error) fail(error);
  },
};

/** Prototype: grants made in this page, gone on reload. */
const mockHolders = new Map<string, CourseHolder[]>();

const mockBackend: CourseAccessBackend = {
  list: async (courseId) => mockHolders.get(courseId) ?? [],
  grant: async (courseId, input) => {
    const list = mockHolders.get(courseId) ?? [];
    const email = input.email.trim().toLowerCase();
    if (list.some((h) => h.email === email && isActiveHolder(h))) throw new CourseAccessError("alreadyHeld");
    const holder: CourseHolder = {
      id: crypto.randomUUID(),
      email,
      name: null,
      source: "manual_grant",
      note: input.note.trim() || null,
      startsAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      revokedAt: null,
      grantedBy: null,
      stepsDone: 0,
      completedAt: null,
      certificateCode: null,
    };
    mockHolders.set(courseId, [holder, ...list]);
  },
  revoke: async (entitlementId) => {
    for (const [courseId, list] of mockHolders) {
      mockHolders.set(
        courseId,
        list.map((h) => (h.id === entitlementId ? { ...h, revokedAt: new Date().toISOString() } : h)),
      );
    }
  },
};

export const courseAccessBackend: CourseAccessBackend = isSupabaseConfigured ? supabaseBackend : mockBackend;
