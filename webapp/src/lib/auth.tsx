import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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

/**
 * Editable member profile. The name lives here as two fields rather than as one
 * string, so the profile form owns the single representation and `displayName`
 * / `initials` stay derived — editing the name in the dashboard has to move the
 * greeting and the avatar with it.
 */
export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine: string;
  postalCode: string;
  city: string;
  /** One of `DELIVERY_COUNTRIES`, the list checkout also uses. */
  country: string;
  newsletter: boolean;
}

/** Fields the profile form can change. The email is edited here too. */
export type ProfilePatch = Partial<Profile>;

/**
 * Demo postal details, the counterpart of the seeded orders in `data/orders.ts`:
 * an account with a shipping history has a delivery address. The identity
 * fields are not seeded — they come from what was typed on the login form.
 */
const DEMO_POSTAL: Pick<Profile, "phone" | "addressLine" | "postalCode" | "city" | "country"> = {
  phone: "+33 6 12 34 56 78",
  addressLine: "18 rue des Lices",
  postalCode: "49100",
  city: "Angers",
  country: "fr",
};

interface AuthContextValue {
  signedIn: boolean;
  /** Full profile, or null when signed out. */
  profile: Profile | null;
  /** Email of the open session, purely for display. */
  email: string | null;
  /** Falls back to the local part of the email when no name was given. */
  displayName: string;
  /** One or two letters for the account avatar. */
  initials: string;
  signIn: (email: string, identity?: SignInIdentity) => void;
  signOut: () => void;
  /** Applies an edit from the profile form. No-op while signed out. */
  updateProfile: (patch: ProfilePatch) => void;
}

/**
 * What a sign-in may carry beyond the email. The login form sends the name;
 * the registration journey also sends what it asked for — phone, country and
 * the marketing choice — so the new profile reflects the answers given.
 */
export interface SignInIdentity {
  firstName?: string;
  lastName?: string;
  phone?: string;
  /** One of `DELIVERY_COUNTRIES`; anything else keeps the demo address's country. */
  country?: string;
  /** Explicit opt-in. Omitted by the login form, which keeps its current default. */
  newsletter?: boolean;
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

/** Name shown everywhere: the typed one, else the email's local part. */
function displayNameOf(profile: Profile | null): string {
  if (!profile) return "";
  const full = `${profile.firstName} ${profile.lastName}`.trim();
  return full || (profile.email ? nameFromEmail(profile.email) : "");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);

  const signIn = useCallback((email: string, identity?: SignInIdentity) => {
    setProfile({
      firstName: identity?.firstName?.trim() ?? "",
      lastName: identity?.lastName?.trim() ?? "",
      email: email.trim(),
      newsletter: identity?.newsletter ?? true,
      ...DEMO_POSTAL,
      ...(identity?.phone ? { phone: identity.phone } : {}),
      ...(identity?.country ? { country: identity.country } : {}),
    });
  }, []);

  const signOut = useCallback(() => setProfile(null), []);

  const updateProfile = useCallback((patch: ProfilePatch) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const displayName = displayNameOf(profile);
    return {
      signedIn: profile !== null,
      profile,
      email: profile?.email ?? null,
      displayName,
      initials: displayName ? initialsOf(displayName) : "?",
      signIn,
      signOut,
      updateProfile,
    };
  }, [profile, signIn, signOut, updateProfile]);

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
