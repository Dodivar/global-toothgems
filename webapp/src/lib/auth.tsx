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
  signIn: (email: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      signedIn: email !== null,
      email,
      signIn: (next: string) => setEmail(next.trim()),
      signOut: () => setEmail(null),
    }),
    [email],
  );

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
