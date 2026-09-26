import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { AuthError, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase/client";
import { DELIVERY_COUNTRIES } from "../data/countries";
import { LEGAL_POLICY_VERSION, registrationMetadata, type RegistrationData } from "./registration";

/**
 * Member session.
 *
 * With Supabase configured this is a real Supabase Auth session: sign-in checks
 * the password, sign-up creates the account and sends the confirmation email,
 * and the profile is read from `public.profiles`. Being signed in here only
 * decides which screens open — every read and write is still authorized by Row
 * Level Security in Postgres, never by this file.
 *
 * Without Supabase it falls back to the prototype's mock: no credential is
 * verified and nothing is persisted, so the journeys can still be clicked
 * through. Nothing may rely on the mock for access control.
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
 * an account with a shipping history has a delivery address. Mock mode only.
 */
const DEMO_POSTAL: Pick<Profile, "phone" | "addressLine" | "postalCode" | "city" | "country"> = {
  phone: "+33 6 12 34 56 78",
  addressLine: "18 rue des Lices",
  postalCode: "49100",
  city: "Angers",
  country: "fr",
};

/** Outcome of a password sign-in, each with its own message on the login page. */
export type SignInResult = "accepted" | "rejected" | "unconfirmed" | "suspended" | "rateLimited" | "unavailable";

/** Outcome of an account creation. */
export type SignUpResult =
  | "confirmationSent"
  | "signedIn"
  | "emailTaken"
  | "weakPassword"
  | "rateLimited"
  | "network"
  | "server";

/** Outcome of asking for a new confirmation email. */
export type ResendResult = "sent" | "rateLimited" | "failed";

interface AuthContextValue {
  signedIn: boolean;
  /** True while a kept session is being restored at page load. */
  restoring: boolean;
  /** True when sign-in goes through Supabase Auth rather than the mock. */
  realAuth: boolean;
  /** Full profile, or null when signed out. */
  profile: Profile | null;
  /** Email of the open session, purely for display. */
  email: string | null;
  /** Falls back to the local part of the email when no name was given. */
  displayName: string;
  /** One or two letters for the account avatar. */
  initials: string;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  /** Creates the account. `redirectTo` is where the confirmation link lands. */
  signUp: (data: RegistrationData, locale: string, redirectTo: string) => Promise<SignUpResult>;
  resendConfirmation: (email: string, redirectTo: string) => Promise<ResendResult>;
  /**
   * Mock mode only: opens a session without any check. The registration
   * journey uses it to finish its simulated verification. A no-op with real auth.
   */
  signIn: (email: string, identity?: SignInIdentity) => void;
  signOut: () => void;
  /** Applies an edit from the profile form. No-op while signed out. */
  updateProfile: (patch: ProfilePatch) => void;
}

/**
 * What a mock sign-in may carry beyond the email: the registration journey
 * sends what it asked for, so the new profile reflects the answers given.
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

/** Builds the value every consumer reads, the same way for both providers. */
function contextValue(
  profile: Profile | null,
  rest: Omit<AuthContextValue, "signedIn" | "profile" | "email" | "displayName" | "initials">,
): AuthContextValue {
  const displayName = displayNameOf(profile);
  return {
    ...rest,
    signedIn: profile !== null,
    profile,
    email: profile?.email ?? null,
    displayName,
    initials: displayName ? initialsOf(displayName) : "?",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
  ) : (
    <DemoAuthProvider>{children}</DemoAuthProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Supabase Auth                                                      */
/* ------------------------------------------------------------------ */

type ProfileLoad = { profile: Profile } | { suspended: true } | null;

/**
 * The member profile behind a Supabase user (own row, allowed by RLS). The
 * postal fields stay empty: addresses live in the address book, not here.
 */
async function loadProfile(user: User): Promise<ProfileLoad> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, phone, country_code, marketing_opt_in, status")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  if (data.status !== "active") return { suspended: true };

  // `country_code` is the declared country, any ISO code; the profile form's
  // country is a delivery country, so only those carry over.
  const country = (data.country_code ?? "").toLowerCase();
  return {
    profile: {
      firstName: data.first_name ?? "",
      lastName: data.last_name ?? "",
      email: data.email ?? user.email ?? "",
      phone: data.phone ?? "",
      addressLine: "",
      postalCode: "",
      city: "",
      country: (DELIVERY_COUNTRIES as readonly string[]).includes(country) ? country : "",
      newsletter: data.marketing_opt_in,
    },
  };
}

const isRateLimit = (error: AuthError) =>
  error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit";

function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);

  const applyUser = useCallback(async (user: User | null): Promise<ProfileLoad> => {
    const loaded = user ? await loadProfile(user) : null;
    if (loaded && "suspended" in loaded) {
      // A suspended or deactivated account keeps no session.
      await supabase?.auth.signOut();
      setProfile(null);
      setUserId(null);
      return loaded;
    }
    setProfile(loaded?.profile ?? null);
    setUserId(loaded ? user!.id : null);
    return loaded;
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    // Restores a kept session, and follows sign-in from the confirmation link,
    // sign-outs and token expiry from any tab.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
      // Supabase warns against awaiting its own calls inside this callback.
      setTimeout(async () => {
        if (!active) return;
        await applyUser(session?.user ?? null);
        if (active) setRestoring(false);
      }, 0);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [applyUser]);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      if (!supabase) return "unavailable";
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (error.code === "email_not_confirmed") return "unconfirmed";
        if (isRateLimit(error)) return "rateLimited";
        return error.status === 400 || error.status === 401 ? "rejected" : "unavailable";
      }
      const loaded = await applyUser(data.user);
      if (loaded && "suspended" in loaded) return "suspended";
      return loaded ? "accepted" : "unavailable";
    },
    [applyUser],
  );

  const signUp = useCallback(
    async (data: RegistrationData, locale: string, redirectTo: string): Promise<SignUpResult> => {
      if (!supabase) return "server";
      const { data: result, error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: { emailRedirectTo: redirectTo, data: registrationMetadata(data, locale) },
      });
      if (error) {
        if (error.code === "user_already_exists" || error.code === "email_exists") return "emailTaken";
        if (error.code === "weak_password") return "weakPassword";
        if (isRateLimit(error)) return "rateLimited";
        return error.name === "AuthRetryableFetchError" ? "network" : "server";
      }
      // With email enumeration protection, an address that already has an
      // account answers with a user holding no identity and sends nothing.
      if (result.user && result.user.identities?.length === 0) return "emailTaken";
      // Email confirmation disabled on the project: the session is already open.
      if (result.session) {
        await applyUser(result.user);
        return "signedIn";
      }
      return "confirmationSent";
    },
    [applyUser],
  );

  const resendConfirmation = useCallback(async (email: string, redirectTo: string): Promise<ResendResult> => {
    if (!supabase) return "failed";
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (!error) return "sent";
    return isRateLimit(error) ? "rateLimited" : "failed";
  }, []);

  const signOut = useCallback(() => {
    setProfile(null);
    setUserId(null);
    void supabase?.auth.signOut();
  }, []);

  /**
   * Shows the edit at once, then writes what the database holds for the
   * profile: name and phone on `profiles`, the newsletter choice as a consent
   * record (the opt-in column is a cache the database maintains). Postal
   * fields belong to the address book and email changes to Supabase Auth, so
   * they stay local here. A refused write reloads the stored profile.
   */
  const updateProfile = useCallback(
    (patch: ProfilePatch) => {
      if (!profile || !userId || !supabase) return;
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
      const client = supabase;

      const writes: PromiseLike<{ error: unknown }>[] = [];
      const row: { first_name?: string | null; last_name?: string | null; phone?: string | null } = {};
      if (patch.firstName !== undefined) row.first_name = patch.firstName.trim() || null;
      if (patch.lastName !== undefined) row.last_name = patch.lastName.trim() || null;
      if (patch.phone !== undefined) row.phone = patch.phone.trim() || null;
      if (Object.keys(row).length > 0) writes.push(client.from("profiles").update(row).eq("id", userId));
      if (patch.newsletter !== undefined && patch.newsletter !== profile.newsletter) {
        writes.push(
          client.from("consent_records").insert({
            user_id: userId,
            purpose: "marketing_email",
            granted: patch.newsletter,
            policy_version: LEGAL_POLICY_VERSION,
            source: "account",
          }),
        );
      }
      if (writes.length === 0) return;
      void Promise.all(writes).then(async (results) => {
        if (results.some((r) => r.error)) {
          const { data } = await client.auth.getUser();
          await applyUser(data.user);
        }
      });
    },
    [profile, userId, applyUser],
  );

  const signIn = useCallback(() => {}, []);

  const value = useMemo(
    () =>
      contextValue(profile, {
        restoring,
        realAuth: true,
        signInWithPassword,
        signUp,
        resendConfirmation,
        signIn,
        signOut,
        updateProfile,
      }),
    [profile, restoring, signInWithPassword, signUp, resendConfirmation, signIn, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Mock (no Supabase configured)                                      */
/* ------------------------------------------------------------------ */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function DemoAuthProvider({ children }: { children: ReactNode }) {
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

  const signInWithPassword = useCallback(
    async (email: string): Promise<SignInResult> => {
      // The pending state is the point: a real sign-in has latency.
      await wait(700);
      signIn(email);
      return "accepted";
    },
    [signIn],
  );

  // The registration journey simulates its own service in mock mode
  // (`lib/registration.ts`); these exist so the interface is complete.
  const signUp = useCallback(async (): Promise<SignUpResult> => "confirmationSent", []);
  const resendConfirmation = useCallback(async (): Promise<ResendResult> => "sent", []);

  const signOut = useCallback(() => setProfile(null), []);

  const updateProfile = useCallback((patch: ProfilePatch) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo(
    () =>
      contextValue(profile, {
        restoring: false,
        realAuth: false,
        signInWithPassword,
        signUp,
        resendConfirmation,
        signIn,
        signOut,
        updateProfile,
      }),
    [profile, signInWithPassword, signUp, resendConfirmation, signIn, signOut, updateProfile],
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
  const { signedIn, restoring } = useAuth();
  const location = useLocation();

  // Wait for a kept session before deciding, or a refresh would bounce a
  // signed-in member to the login page.
  if (restoring) {
    return <div aria-busy="true" className="min-h-[60vh]" />;
  }
  if (!signedIn) {
    return <Navigate to="/connexion" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}
