import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

/**
 * Mockup administrator session.
 *
 * Separate from `lib/auth.tsx` on purpose: a customer account and an
 * administrator account are different identities with different lifetimes, and
 * collapsing them here would make the prototype suggest an architecture the
 * real product must not have. Like the customer one, this verifies nothing —
 * real administration access means Supabase Auth plus server-side RBAC and RLS,
 * and none of it may ever depend on a value from this file.
 */

export interface AdminIdentity {
  name: string;
  email: string;
  /** Shown in the sidebar. The real role comes from the server, never the client. */
  role: "owner" | "manager";
  initials: string;
}

interface AdminAuthValue {
  admin: AdminIdentity | null;
  signedIn: boolean;
  /**
   * Resolves once the simulated round-trip is over, so the form can show a
   * spinner. Returns whether the credentials were accepted; a rejected attempt
   * leaves no session behind, exactly as the real endpoint must.
   */
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

/** The single demo account the prototype accepts. */
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

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);

  const signIn = useCallback(async (email: string, password: string) => {
    await new Promise((resolve) => setTimeout(resolve, SIGN_IN_DELAY_MS));
    // The single credential the prototype knows. Checking it here rather than
    // in the form is what keeps a rejected attempt from opening a session — the
    // real endpoint will be the only place this decision is ever made.
    if (password !== DEMO_ADMIN_PASSWORD) return false;
    const name = email.toLowerCase() === DEMO_ADMIN_EMAIL ? "Camille Dubois" : nameFromEmail(email);
    setAdmin({ name, email: email.trim(), role: "owner", initials: initialsOf(name) });
    return true;
  }, []);

  const signOut = useCallback(() => setAdmin(null), []);

  const value = useMemo<AdminAuthValue>(
    () => ({ admin, signedIn: admin !== null, signIn, signOut }),
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
 * A UI gate for the prototype only — see the note at the top of this file.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { signedIn } = useAdminAuth();
  const location = useLocation();

  if (!signedIn) {
    return <Navigate to="/admin/connexion" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}
