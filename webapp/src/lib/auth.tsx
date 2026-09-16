import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

/**
 * Mockup session state.
 *
 * This is a UI gate, not access control: no credential is verified, nothing is
 * persisted, and every check runs in the browser. It exists so the prototype can
 * show the rule "a formation requires an account, a product does not". Real
 * authentication (Supabase Auth) and server-side authorization arrive later and
 * must not rely on anything in this file.
 */
interface AuthContextValue {
  signedIn: boolean;
  /** Email the visitor typed on the mockup login form, purely for display. */
  email: string | null;
  /** Name typed when creating the account, for the dashboard greeting. */
  name: string | null;
  /** Falls back to the local part of the email when no name was given. */
  displayName: string;
  /** One or two letters for the account avatar. */
  initials: string;
  signIn: (email: string, name?: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** "camille@studio.fr" -> "Camille": enough for a greeting when no name was typed. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ email: string; name: string | null } | null>(null);

  const value = useMemo<AuthContextValue>(() => {
    const email = session?.email ?? null;
    const name = session?.name ?? null;
    const displayName = name ?? (email ? nameFromEmail(email) : "");
    return {
      signedIn: session !== null,
      email,
      name,
      displayName,
      initials: displayName ? initialsOf(displayName) : "?",
      signIn: (nextEmail: string, nextName?: string) =>
        setSession({ email: nextEmail.trim(), name: nextName?.trim() || null }),
      signOut: () => setSession(null),
    };
  }, [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Guards the routes that require an account. Gating the route rather than each
 * button covers the plain `<Link>`s in the navigation menu and direct URL entry
 * alike. The intended destination travels in history state so the login page can
 * send the visitor straight there afterwards.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  const location = useLocation();

  if (!signedIn) {
    return <Navigate to="/connexion" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}
