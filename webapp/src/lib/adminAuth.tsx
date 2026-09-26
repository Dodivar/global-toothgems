import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase/client";

/**
 * Administrator session.
 *
 * Separate from `lib/auth.tsx` on purpose: a customer account and an
 * administrator account are different identities with different lifetimes.
 *
 * With Supabase configured this is a real Supabase Auth session, accepted only
 * for an active profile whose role is a staff role. That check only decides
 * which screens open: every read and write is still authorized by Row Level
 * Security and `private.has_permission()` in Postgres, never by this file.
 *
 * Without Supabase it falls back to the prototype's single demo account, which
 * verifies nothing and exists only so the back office can be clicked through.
 */

export interface AdminIdentity {
  name: string;
  email: string;
  /** Role key (`admin`, `manager`, `viewer`, or the prototype's `owner`). Display only. */
  role: string;
  initials: string;
}

/** Outcome of a sign-in attempt, each with its own message on the access screen. */
export type AdminSignInResult = "accepted" | "rejected" | "notStaff" | "unavailable";

interface AdminAuthValue {
  admin: AdminIdentity | null;
  signedIn: boolean;
  /** True while an existing session is being restored at page load. */
  restoring: boolean;
  /** True when sign-in goes through Supabase Auth rather than the demo account. */
  realAuth: boolean;
  signIn: (email: string, password: string) => Promise<AdminSignInResult>;
  signOut: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

/** The single demo account the prototype accepts when Supabase is not configured. */
export const DEMO_ADMIN_EMAIL = "camille@globaltoothgems.com";
export const DEMO_ADMIN_PASSWORD = "toothgems2026";

/** How long the fake sign-in takes. Long enough to read the loading state. */
const SIGN_IN_DELAY_MS = 900;

function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
}

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
  if (error || !data) return null;
  const role = data.roles as { is_staff: boolean } | { is_staff: boolean }[] | null;
  const isStaff = Array.isArray(role) ? role[0]?.is_staff : role?.is_staff;
  if (!isStaff || data.status !== "active") return null;

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

function SupabaseAdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    // Restores a session kept by supabase-js, and follows sign-outs and token
    // expiry from any tab. Sign-in itself is handled by `signIn` below.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") return;
      // Supabase warns against awaiting its own calls inside this callback.
      setTimeout(async () => {
        const identity = session?.user ? await staffIdentity(session.user) : null;
        if (!active) return;
        setAdmin(identity);
        setRestoring(false);
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AdminSignInResult> => {
    if (!supabase) return "unavailable";
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return error.status === 400 || error.status === 401 ? "rejected" : "unavailable";
    const identity = await staffIdentity(data.user);
    if (!identity) {
      // A valid account without staff access leaves no session behind.
      await supabase.auth.signOut();
      return "notStaff";
    }
    setAdmin(identity);
    return "accepted";
  }, []);

  const signOut = useCallback(() => {
    setAdmin(null);
    void supabase?.auth.signOut();
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({ admin, signedIn: admin !== null, restoring, realAuth: true, signIn, signOut }),
    [admin, restoring, signIn, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

function DemoAdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);

  const signIn = useCallback(async (email: string, password: string): Promise<AdminSignInResult> => {
    await new Promise((resolve) => setTimeout(resolve, SIGN_IN_DELAY_MS));
    // The single credential the prototype knows. Checking it here rather than
    // in the form is what keeps a rejected attempt from opening a session.
    if (password !== DEMO_ADMIN_PASSWORD) return "rejected";
    const name = email.toLowerCase() === DEMO_ADMIN_EMAIL ? "Camille Dubois" : nameFromEmail(email);
    setAdmin({ name, email: email.trim(), role: "owner", initials: initialsOf(name) });
    return "accepted";
  }, []);

  const signOut = useCallback(() => setAdmin(null), []);

  const value = useMemo<AdminAuthValue>(
    () => ({ admin, signedIn: admin !== null, restoring: false, realAuth: false, signIn, signOut }),
    [admin, signIn, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}

/**
 * Sends anyone without an open administrator session to the access screen.
 * A navigation gate only — the database enforces access on every request.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { signedIn, restoring } = useAdminAuth();
  const location = useLocation();

  // Wait for a kept session before deciding, or a refresh would bounce a
  // signed-in administrator to the access screen.
  if (restoring) {
    return <div aria-busy="true" className="min-h-screen" />;
  }
  if (!signedIn) {
    return <Navigate to="/admin/connexion" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}
