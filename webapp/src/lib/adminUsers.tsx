import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ADMIN_USERS,
  type AdminUser,
  type UserActivity,
  type UserActivityKind,
  type UserRole,
  type UserStatus,
  type UserTeam,
} from "../data/adminUsers";
import type { Localized } from "../data/types";

/**
 * The administration users, as the Users workspace edits them, held in memory.
 *
 * Same contract as `adminCustomers.tsx`: a change moves the data, not just a
 * toast. Changing a role moves the badge in the table, the Managers and
 * Administrators tiles, the permission summary in the drawer and that user's own
 * history at once.
 *
 * The write operations are asynchronous on purpose. Each one waits a moment and
 * can be refused, the way a real request can, so the forms have genuine
 * pending, success and error states to show rather than pretending every save
 * lands instantly. The one refusal simulated here — an email address that is
 * already in use — is decided in this file, not in the form, because the
 * server is the only place that can know it.
 *
 * None of this is authorization. A real role change is a server-side
 * transition behind explicit RBAC, written to an audit log; a suspension must
 * revoke the user's sessions. Nothing here may be relied on by the production
 * app (`AGENTS.md` sections 7 and 12).
 */

/** Fields the add and edit forms write. Everything else is read-only. */
export interface UserDraft {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  jobTitle: string;
  team: UserTeam;
}

export type UserWriteError = "emailTaken" | "notFound";
export type UserWriteResult = { ok: true; user: AdminUser } | { ok: false; error: UserWriteError };

interface AdminUsersContextValue {
  users: AdminUser[];
  createUser: (draft: UserDraft) => Promise<UserWriteResult>;
  updateUser: (id: string, draft: UserDraft) => Promise<UserWriteResult>;
  changeRole: (id: string, role: UserRole) => Promise<UserWriteResult>;
  setStatus: (id: string, status: UserStatus) => Promise<UserWriteResult>;
  resendInvitation: (id: string) => Promise<UserWriteResult>;
  deleteUser: (id: string) => Promise<UserWriteResult>;
}

const AdminUsersContext = createContext<AdminUsersContextValue | null>(null);

/** How long a simulated write takes. Long enough to read the pending state. */
const WRITE_DELAY = 650;

const wait = () => new Promise((resolve) => setTimeout(resolve, WRITE_DELAY));

function localizedTitle(value: string, previous?: Localized): Localized {
  // A job title typed in the form is kept verbatim in both languages unless it
  // is unchanged — overwriting a curated translation with the same text would
  // quietly lose the other language.
  if (previous && (previous.fr === value || previous.en === value)) return previous;
  return { fr: value, en: value };
}

/** The history entry a status transition writes. */
function statusKind(from: UserStatus, to: UserStatus): UserActivityKind {
  if (to === "suspended") return "suspended";
  if (from === "suspended") return "reactivated";
  return to === "active" ? "activated" : "invitationSent";
}

export function AdminUsersProvider({ actor, children }: { actor: string; children: ReactNode }) {
  const [users, setUsers] = useState<AdminUser[]>(ADMIN_USERS);
  // The async writes read the latest list after their delay, not the one that
  // was current when they started — two saves in a row must not undo each other.
  const latest = useRef(users);
  useEffect(() => {
    latest.current = users;
  }, [users]);
  const sequence = useRef(0);

  const entry = useCallback(
    (kind: UserActivityKind, params?: Record<string, string>): UserActivity => {
      sequence.current += 1;
      return {
        id: `session-${sequence.current}`,
        at: new Date().toISOString(),
        kind,
        params: { by: actor, ...params },
      };
    },
    [actor],
  );

  const emailTaken = useCallback(
    (email: string, exceptId?: string) =>
      latest.current.some((u) => u.id !== exceptId && u.email.toLowerCase() === email.trim().toLowerCase()),
    [],
  );

  const patch = useCallback(
    async (id: string, update: (user: AdminUser) => AdminUser): Promise<UserWriteResult> => {
      await wait();
      const current = latest.current.find((u) => u.id === id);
      if (!current) return { ok: false, error: "notFound" };
      const next = update(current);
      setUsers((prev) => prev.map((u) => (u.id === id ? next : u)));
      return { ok: true, user: next };
    },
    [],
  );

  const createUser = useCallback(
    async (draft: UserDraft): Promise<UserWriteResult> => {
      await wait();
      if (emailTaken(draft.email)) return { ok: false, error: "emailTaken" };
      const now = new Date().toISOString();
      sequence.current += 1;
      const user: AdminUser = {
        id: `u-new-${sequence.current}`,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email.trim().toLowerCase(),
        role: draft.role,
        status: draft.status,
        jobTitle: localizedTitle(draft.jobTitle.trim()),
        team: draft.team,
        createdAt: now,
        // An invited user has not signed in; an account created as active has
        // not either, so neither gets an activity date it has not earned.
        lastActiveAt: null,
        invitedBy: actor,
        twoFactor: false,
        activity: [entry(draft.status === "invited" ? "invitationSent" : "accountCreated")],
      };
      setUsers((prev) => [user, ...prev]);
      return { ok: true, user };
    },
    [actor, entry, emailTaken],
  );

  const updateUser = useCallback(
    async (id: string, draft: UserDraft): Promise<UserWriteResult> => {
      await wait();
      if (emailTaken(draft.email, id)) return { ok: false, error: "emailTaken" };
      const current = latest.current.find((u) => u.id === id);
      if (!current) return { ok: false, error: "notFound" };
      const history: UserActivity[] = [entry("profileUpdated")];
      if (current.role !== draft.role) {
        history.unshift(entry("roleChanged", { from: current.role, to: draft.role }));
      }
      if (current.status !== draft.status) {
        history.unshift(entry(statusKind(current.status, draft.status)));
      }
      const next: AdminUser = {
        ...current,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email.trim().toLowerCase(),
        role: draft.role,
        status: draft.status,
        jobTitle: localizedTitle(draft.jobTitle.trim(), current.jobTitle),
        team: draft.team,
        activity: [...history, ...current.activity],
      };
      setUsers((prev) => prev.map((u) => (u.id === id ? next : u)));
      return { ok: true, user: next };
    },
    [entry, emailTaken],
  );

  const changeRole = useCallback(
    (id: string, role: UserRole) =>
      patch(id, (user) => ({
        ...user,
        role,
        activity: [entry("roleChanged", { from: user.role, to: role }), ...user.activity],
      })),
    [patch, entry],
  );

  const setStatus = useCallback(
    (id: string, status: UserStatus) =>
      patch(id, (user) => ({
        ...user,
        status,
        activity: [entry(statusKind(user.status, status)), ...user.activity],
      })),
    [patch, entry],
  );

  const resendInvitation = useCallback(
    (id: string) =>
      patch(id, (user) => ({ ...user, activity: [entry("invitationResent"), ...user.activity] })),
    [patch, entry],
  );

  const deleteUser = useCallback(async (id: string): Promise<UserWriteResult> => {
    await wait();
    const current = latest.current.find((u) => u.id === id);
    if (!current) return { ok: false, error: "notFound" };
    setUsers((prev) => prev.filter((u) => u.id !== id));
    return { ok: true, user: current };
  }, []);

  const value = useMemo<AdminUsersContextValue>(
    () => ({ users, createUser, updateUser, changeRole, setStatus, resendInvitation, deleteUser }),
    [users, createUser, updateUser, changeRole, setStatus, resendInvitation, deleteUser],
  );

  return <AdminUsersContext.Provider value={value}>{children}</AdminUsersContext.Provider>;
}

export function useAdminUsers() {
  const ctx = useContext(AdminUsersContext);
  if (!ctx) throw new Error("useAdminUsers must be used within AdminUsersProvider");
  return ctx;
}
