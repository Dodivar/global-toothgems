import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isActiveStaff, type StaffProfileRow } from "./staffProfile";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, sessionReady, supabase } from "./supabase/client";
import { useHydrated } from "./useHydrated";
import { initialsOf } from "./initials";

/**
 * Administrator session.
 *
 * The back office has no sign-in page of its own (decided 2026-11-11): staff
 * sign in on `/connexion` like every member, and this provider recognises the
 * session as a staff one when the account's profile is an active staff
 * member's. That check only decides which screens open: every read and write
 * is still authorized by Row Level Security and `private.has_permission()` in
 * Postgres, never by this file.
 *
 * Staff also need their second factor (Supabase Auth MFA, an authenticator
 * app): `secondFactor` is true once the session is at assurance level aal2,
 * which the database requires for every staff right (migration
 * `staff_mfa_required`). Until then the back office shows the second-factor
 * screen (`components/admin/StaffSecondFactor.tsx`).
 *
 * Without Supabase it falls back to the prototype's demo staff session, kept
 * for the tab and opened by the smoke tests; it verifies nothing.
 */

interface AdminIdentity {
  name: string;
  email: string;
  /** Role key (`admin`, `manager`, `viewer`, or the prototype's `owner`). Display only. */
  role: string;
  initials: string;
}

interface AdminAuthValue {
  admin: AdminIdentity | null;
  signedIn: boolean;
  /** True while an existing session is being restored at page load. */
  restoring: boolean;
  /** True once the session has passed the second factor (aal2); always true in mock mode. */
  secondFactor: boolean;
  signOut: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

function nameFromEmail(email: string): string {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * The staff identity behind a Supabase user, or null when the account is not
 * an active staff member. Reads the caller's own profile (allowed by RLS).
 */
async function staffIdentity(user: User): Promise<AdminIdentity | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, display_name, email, role, status, roles ( is_staff )")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data || !isActiveStaff(data as StaffProfileRow)) return null;

  const email = data.email ?? user.email ?? "";
  const name =
    data.display_name?.trim() ||
    [data.first_name, data.last_name].filter(Boolean).join(" ").trim() ||
    nameFromEmail(email);
  return { name, email, role: data.role, initials: initialsOf(name) };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAdminAuthProvider>{children}</SupabaseAdminAuthProvider>
  ) : (
    <DemoAdminAuthProvider>{children}</DemoAdminAuthProvider>
  );
}

/** Whether the session has passed the second factor. Read from the session's own token: no request. */
async function hasSecondFactor(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !error && data?.currentLevel === "aal2";
}

function SupabaseAdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [secondFactor, setSecondFactor] = useState(false);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    // Restores a session kept by supabase-js, and follows sign-ins, sign-outs,
    // a second factor verified (MFA_CHALLENGE_VERIFIED) and token expiry from
    // any tab. Staff sign in on the member login: a staff member is
    // recognised without a reload (the member space then offers the way to
    // the back office). A non-staff account simply resolves to null.
    // Subscribes once a pre-migration session has been carried over (`sessionReady`).
    const client = supabase;
    let unsubscribe = () => {};
    void sessionReady.then(() => {
      if (!active) return;
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Supabase warns against awaiting its own calls inside this callback.
        setTimeout(async () => {
          const identity = session?.user ? await staffIdentity(session.user) : null;
          const verified = identity ? await hasSecondFactor() : false;
          if (!active) return;
          setAdmin(identity);
          setSecondFactor(verified);
          setRestoring(false);
        }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signOut = useCallback(() => {
    setAdmin(null);
    setSecondFactor(false);
    void supabase?.auth.signOut();
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({ admin, signedIn: admin !== null, restoring, secondFactor, signOut }),
    [admin, restoring, secondFactor, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

/**
 * The mock staff session is kept for the browser tab (sessionStorage), like
 * the member's (docs/migration-nextjs.md, phases 4–5): it survives a reload or
 * an address typed in. Mock mode only.
 */
const DEMO_ADMIN_SESSION_KEY = "gt-demo-admin-session";

function readDemoAdmin(): AdminIdentity | null {
  try {
    const raw = window.sessionStorage.getItem(DEMO_ADMIN_SESSION_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<AdminIdentity>) : null;
    return stored && typeof stored.email === "string" && typeof stored.name === "string" ? { ...(stored as AdminIdentity) } : null;
  } catch {
    return null;
  }
}

function writeDemoAdmin(admin: AdminIdentity | null) {
  try {
    if (admin) window.sessionStorage.setItem(DEMO_ADMIN_SESSION_KEY, JSON.stringify(admin));
    else window.sessionStorage.removeItem(DEMO_ADMIN_SESSION_KEY);
  } catch {
    // Blocked storage: the demo session lasts this page.
  }
}

function DemoAdminAuthProvider({ children }: { children: ReactNode }) {
  // Read once hydrated (server-rendered pages carry this provider too);
  // `changed` is the session as changed on this page.
  const hydrated = useHydrated();
  const stored = useMemo(() => (hydrated ? readDemoAdmin() : null), [hydrated]);
  const [changed, setChanged] = useState<AdminIdentity | null | undefined>(undefined);
  const admin = changed === undefined ? stored : changed;
  const setAdmin = useCallback((value: AdminIdentity | null) => {
    writeDemoAdmin(value);
    setChanged(value);
  }, []);

  const signOut = useCallback(() => setAdmin(null), [setAdmin]);

  const value = useMemo<AdminAuthValue>(
    () => ({ admin, signedIn: admin !== null, restoring: !hydrated, secondFactor: true, signOut }),
    [admin, hydrated, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
