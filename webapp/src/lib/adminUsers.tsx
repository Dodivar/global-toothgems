import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { AdminUser, PermissionMatrix, UserRole } from "../data/adminUsers";
import {
  editPatches,
  functionErrorOf,
  inviteBody,
  mapPermissionMatrix,
  mapStaffDirectory,
  roleToDb,
  writeErrorOf,
  type PermissionRow,
  type RolePermissionRow,
  type RoleRow,
  type StaffDirectoryRow,
  type UserDraft,
  type UserWriteError,
} from "./adminUserMapping";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";
import type { TablesUpdate } from "./supabase/database.types";

/**
 * The back-office team, as the Users workspace reads and changes it — the
 * single persistence boundary of this domain (screens never call Supabase).
 *
 * Reads: `staff_directory()` (needs `view_users`), `my_permissions()`, and
 * the permission matrix from `roles`, `permissions`, `role_permissions`.
 *
 * Writes, all under the signed-in member's own JWT:
 * - names, role and status: `UPDATE profiles` — RLS, then
 *   `private.guard_profile_update()`: `manage_users`, ranks ≤ the caller's,
 *   never one's own role or status, audited;
 * - job title and team: `UPSERT staff_profiles` (RLS + `guard_staff_profile()`);
 * - invitations (send, resend, cancel): the Edge Function
 *   `invite-staff-member`, the only place holding the service role.
 *
 * Every write re-reads the directory; a refusal is returned as a reason the
 * screen words, never turned into a success. `permissions` and `callerRank`
 * only decide what the screen offers — the database decides what happens.
 *
 * Without Supabase (local mock mode) the team is empty and nothing can be
 * changed: this is a live domain and never shows invented people.
 */

export type { UserDraft, UserWriteError };
export type UserWriteResult = { ok: true } | { ok: false; error: UserWriteError };
export type InviteResult = { ok: true; outcome: "invited" | "promoted" } | { ok: false; error: UserWriteError };

interface AdminUsersContextValue {
  users: AdminUser[];
  /** True until the first read has answered. */
  loading: boolean;
  /** The last read failed: the empty list is not "no team". */
  failed: boolean;
  /** False in local mock mode: there is no team to read. */
  available: boolean;
  reload: () => void;
  /** Null while loading or when the matrix could not be read. */
  matrix: PermissionMatrix | null;
  /** The signed-in member's id (the "you" marker and the self guard). */
  currentUserId: string | null;
  /** `my_permissions()`: navigation only. */
  permissions: ReadonlySet<string>;
  /** The rank of the signed-in member's role (0 when unknown). */
  callerRank: number;
  inviteUser: (draft: UserDraft) => Promise<InviteResult>;
  updateUser: (id: string, draft: UserDraft) => Promise<UserWriteResult>;
  changeRole: (id: string, role: UserRole) => Promise<UserWriteResult>;
  setStatus: (id: string, status: "active" | "suspended") => Promise<UserWriteResult>;
  resendInvitation: (id: string) => Promise<UserWriteResult>;
  cancelInvitation: (id: string) => Promise<UserWriteResult>;
}

const AdminUsersContext = createContext<AdminUsersContextValue | null>(null);

interface Snapshot {
  users: AdminUser[];
  matrix: PermissionMatrix | null;
  currentUserId: string | null;
  permissions: ReadonlySet<string>;
  callerRank: number;
}

const EMPTY: Snapshot = { users: [], matrix: null, currentUserId: null, permissions: new Set(), callerRank: 0 };

async function readTeam(signal: AbortSignal): Promise<Snapshot> {
  const client = requireSupabase();
  const [session, directory, mine, roles, permissions, grants] = await Promise.all([
    client.auth.getSession(),
    client.rpc("staff_directory").abortSignal(signal),
    client.rpc("my_permissions").abortSignal(signal),
    client.from("roles").select("key, rank, is_staff").abortSignal(signal),
    client.from("permissions").select("key, name").abortSignal(signal),
    client.from("role_permissions").select("role_key, permission_key").abortSignal(signal),
  ]);
  for (const result of [directory, mine, roles, permissions, grants]) {
    if (result.error) throw result.error;
  }
  const currentUserId = session.data.session?.user.id ?? null;
  const roleRows = (roles.data ?? []) as RoleRow[];
  const directoryRows = (directory.data ?? []) as unknown as StaffDirectoryRow[];
  const self = directoryRows.find((row) => row.user_id === currentUserId);
  return {
    users: mapStaffDirectory(directoryRows),
    matrix: mapPermissionMatrix(roleRows, (permissions.data ?? []) as PermissionRow[], (grants.data ?? []) as RolePermissionRow[]),
    currentUserId,
    permissions: new Set(mine.data ?? []),
    callerRank: self && self.status === "active" ? self.role_rank : 0,
  };
}

/** Calls `invite-staff-member`; its `{ error }` codes become the screen's reasons. */
async function callInviteFunction(body: Record<string, unknown>): Promise<{ status?: string; error?: UserWriteError }> {
  const { data, error } = await requireSupabase().functions.invoke("invite-staff-member", { body });
  if (!error) return { status: (data as { status?: string } | null)?.status };
  if (error instanceof FunctionsHttpError) {
    try {
      const answer = (await (error.context as Response).json()) as { error?: unknown };
      return { error: functionErrorOf(answer.error) };
    } catch {
      return { error: "unavailable" };
    }
  }
  return { error: "unavailable" };
}

export function AdminUsersProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAdminUsersProvider>{children}</SupabaseAdminUsersProvider>
  ) : (
    <UnavailableAdminUsersProvider>{children}</UnavailableAdminUsersProvider>
  );
}

function SupabaseAdminUsersProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    readTeam(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setFailed(false);
        setSnapshot(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[admin users] load failed", error);
        setFailed(true);
        setSnapshot(EMPTY);
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** Runs one write, then re-reads the team whatever happened. */
  const run = useCallback(
    async (write: () => Promise<UserWriteError | null>): Promise<UserWriteResult> => {
      try {
        const error = await write();
        return error ? { ok: false, error } : { ok: true };
      } catch (error) {
        console.error("[admin users] write failed", error);
        return { ok: false, error: "unavailable" };
      } finally {
        reload();
      }
    },
    [reload],
  );

  /** `UPDATE profiles` for one member; an update RLS let touch no row is a refusal, not a success. */
  const updateProfile = useCallback(async (id: string, patch: TablesUpdate<"profiles">): Promise<UserWriteError | null> => {
    const { error } = await requireSupabase().from("profiles").update(patch).eq("id", id).select("id").single();
    return error ? writeErrorOf(error) : null;
  }, []);

  const inviteUser = useCallback(
    async (draft: UserDraft): Promise<InviteResult> => {
      try {
        const answer = await callInviteFunction(inviteBody(draft));
        if (answer.error) return { ok: false, error: answer.error };
        return { ok: true, outcome: answer.status === "promoted" ? "promoted" : "invited" };
      } catch (error) {
        console.error("[admin users] invitation failed", error);
        return { ok: false, error: "unavailable" };
      } finally {
        reload();
      }
    },
    [reload],
  );

  const updateUser = useCallback(
    (id: string, draft: UserDraft) =>
      run(async () => {
        const user = snapshot?.users.find((u) => u.id === id);
        if (!user) return "notFound";
        const { profile, staff } = editPatches(user, draft);
        const refused = await updateProfile(id, profile);
        if (refused) return refused;
        const { error } = await requireSupabase()
          .from("staff_profiles")
          .upsert(staff, { onConflict: "user_id" })
          .select("user_id")
          .single();
        return error ? writeErrorOf(error) : null;
      }),
    [run, snapshot, updateProfile],
  );

  const changeRole = useCallback(
    (id: string, role: UserRole) => run(() => updateProfile(id, { role: roleToDb(role) })),
    [run, updateProfile],
  );

  const setStatus = useCallback(
    (id: string, status: "active" | "suspended") => run(() => updateProfile(id, { status })),
    [run, updateProfile],
  );

  const resendInvitation = useCallback(
    (id: string) => run(async () => (await callInviteFunction({ action: "resend", user_id: id })).error ?? null),
    [run],
  );

  const cancelInvitation = useCallback(
    (id: string) => run(async () => (await callInviteFunction({ action: "cancel", user_id: id })).error ?? null),
    [run],
  );

  const value = useMemo<AdminUsersContextValue>(
    () => ({
      ...(snapshot ?? EMPTY),
      loading: snapshot === null,
      failed,
      available: true,
      reload,
      inviteUser,
      updateUser,
      changeRole,
      setStatus,
      resendInvitation,
      cancelInvitation,
    }),
    [snapshot, failed, reload, inviteUser, updateUser, changeRole, setStatus, resendInvitation, cancelInvitation],
  );

  return <AdminUsersContext.Provider value={value}>{children}</AdminUsersContext.Provider>;
}

const refuse = () => Promise.resolve({ ok: false as const, error: "unavailable" as const });

/** Local mock mode: no team, no matrix, every write refused. */
function UnavailableAdminUsersProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AdminUsersContextValue>(
    () => ({
      ...EMPTY,
      loading: false,
      failed: false,
      available: false,
      reload: () => undefined,
      inviteUser: refuse,
      updateUser: refuse,
      changeRole: refuse,
      setStatus: refuse,
      resendInvitation: refuse,
      cancelInvitation: refuse,
    }),
    [],
  );
  return <AdminUsersContext.Provider value={value}>{children}</AdminUsersContext.Provider>;
}

export function useAdminUsers() {
  const ctx = useContext(AdminUsersContext);
  if (!ctx) throw new Error("useAdminUsers must be used within AdminUsersProvider");
  return ctx;
}
