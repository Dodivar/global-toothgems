import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "./navigation";
import type { AuthError, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, sessionReady, supabase } from "./supabase/client";
import { DELIVERY_COUNTRIES } from "../data/countries";
import { LEGAL_POLICY_VERSION, registrationMetadata, type RegistrationData } from "./registration";
import { useHydrated } from "./useHydrated";

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
 * verified and only the browser tab keeps the session, so the journeys can still be clicked
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
  | "emailSend"
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
  /**
   * Account id of the open session (`auth.users.id` with Supabase), or null
   * when signed out. Scopes per-account data such as the Studio library; it
   * is not an authorization token — row-level security decides access.
   */
  userId: string | null;
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
  /**
   * Applies an edit from the profile form. Resolves to false when the change
   * was refused (incomplete address, rejected write); no-op while signed out.
   */
  updateProfile: (patch: ProfilePatch) => Promise<boolean>;
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
 * postal fields come from the default shipping address of the address book.
 */
async function loadProfile(user: User): Promise<ProfileLoad> {
  if (!supabase) return null;
  const [{ data, error }, { data: address }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, email, phone, country_code, marketing_opt_in, status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("customer_addresses")
      .select("address_line1, postal_code, city, country_code")
      .eq("user_id", user.id)
      .eq("address_type", "shipping")
      .eq("is_default", true)
      .maybeSingle(),
  ]);
  if (error || !data) return null;
  if (data.status !== "active") return { suspended: true };

  // `country_code` is the declared country, any ISO code; the profile form's
  // country is a delivery country, so only those carry over. A saved delivery
  // address wins over the country declared at sign-up.
  const country = (address?.country_code ?? data.country_code ?? "").toLowerCase();
  return {
    profile: {
      firstName: data.first_name ?? "",
      lastName: data.last_name ?? "",
      email: data.email ?? user.email ?? "",
      phone: data.phone ?? "",
      addressLine: address?.address_line1 ?? "",
      postalCode: address?.postal_code ?? "",
      city: address?.city ?? "",
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
    // sign-outs and token expiry from any tab. Subscribes once a pre-migration
    // session has been carried over (`sessionReady`).
    const client = supabase;
    let unsubscribe = () => {};
    void sessionReady.then(() => {
      if (!active) return;
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;
        // Supabase warns against awaiting its own calls inside this callback.
        setTimeout(async () => {
          if (!active) return;
          await applyUser(session?.user ?? null);
          if (active) setRestoring(false);
        }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe();
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
      if (!loaded) {
        // No readable profile: leave no session behind a sign-in that failed.
        await supabase.auth.signOut();
        return "unavailable";
      }
      return "accepted";
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
        // supabase-js reports every 5xx as "retryable"; only status 0 means the
        // request never reached Supabase.
        if (error.name === "AuthRetryableFetchError" && !error.status) return "network";
        // The confirmation email could not leave (SMTP refused it). Supabase
        // then rolls the new user back, so retrying is a fresh sign-up.
        if (/email/i.test(error.message)) return "emailSend";
        return "server";
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
   * record (the opt-in column is a cache the database maintains), the postal
   * fields as the default shipping address of the address book (emptied
   * fields remove it). Email changes belong to Supabase Auth and stay local
   * here. A refused write reloads the stored profile and resolves to false.
   */
  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<boolean> => {
      if (!profile || !userId || !supabase) return false;
      const client = supabase;
      const next = { ...profile, ...patch };
      const line = next.addressLine.trim();
      const city = next.city.trim();
      const postal = next.postalCode.trim();
      const addressTouched =
        (patch.addressLine !== undefined && line !== profile.addressLine.trim()) ||
        (patch.city !== undefined && city !== profile.city.trim()) ||
        (patch.postalCode !== undefined && postal !== profile.postalCode.trim()) ||
        (patch.country !== undefined && patch.country !== profile.country);
      const addressCleared = !line && !city && !postal;
      const firstName = next.firstName.trim();
      const lastName = next.lastName.trim();
      // The address book needs a recipient name, a street, a city and a country.
      if (addressTouched && !addressCleared && !(line && city && next.country && firstName && lastName)) return false;

      setProfile(next);

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
      if (addressTouched) {
        writes.push(
          (async () => {
            const { data: existing, error } = await client
              .from("customer_addresses")
              .select("id")
              .eq("user_id", userId)
              .eq("address_type", "shipping")
              .eq("is_default", true)
              .maybeSingle();
            if (error) return { error };
            if (addressCleared) {
              return existing
                ? client.from("customer_addresses").delete().eq("id", existing.id)
                : { error: null };
            }
            const values = {
              first_name: firstName,
              last_name: lastName,
              address_line1: line,
              postal_code: postal || null,
              city,
              country_code: next.country.toUpperCase(),
            };
            return existing
              ? client.from("customer_addresses").update(values).eq("id", existing.id)
              : client
                  .from("customer_addresses")
                  .insert({ ...values, user_id: userId, address_type: "shipping", is_default: true });
          })(),
        );
      }
      if (writes.length === 0) return true;
      const results = await Promise.all(writes);
      if (results.some((r) => r.error)) {
        const { data } = await client.auth.getUser();
        await applyUser(data.user);
        return false;
      }
      return true;
    },
    [profile, userId, applyUser],
  );

  const signIn = useCallback(() => {}, []);

  const value = useMemo(
    () =>
      contextValue(profile, {
        restoring,
        realAuth: true,
        userId,
        signInWithPassword,
        signUp,
        resendConfirmation,
        signIn,
        signOut,
        updateProfile,
      }),
    [profile, restoring, userId, signInWithPassword, signUp, resendConfirmation, signIn, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Mock (no Supabase configured)                                      */
/* ------------------------------------------------------------------ */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The mock session is kept for the browser tab (sessionStorage), like the
 * cart (docs/migration-nextjs.md, phases 4–5): a signed-in demo survives a
 * reload or an address typed in. Mock mode only.
 */
const DEMO_SESSION_KEY = "gt-demo-session";

function readDemoSession(): Profile | null {
  try {
    const raw = window.sessionStorage.getItem(DEMO_SESSION_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<Profile>) : null;
    return stored && typeof stored.email === "string" ? { ...(stored as Profile) } : null;
  } catch {
    return null;
  }
}

function writeDemoSession(profile: Profile | null) {
  try {
    if (profile) window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(profile));
    else window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // Blocked storage: the demo session lasts this page.
  }
}

function DemoAuthProvider({ children }: { children: ReactNode }) {
  // Read once hydrated, so a server-rendered page hydrates with the server's
  // markup; `changed` is the session as changed on this page.
  const hydrated = useHydrated();
  const stored = useMemo(() => (hydrated ? readDemoSession() : null), [hydrated]);
  const [changed, setChanged] = useState<Profile | null | undefined>(undefined);
  const profile = changed === undefined ? stored : changed;

  const setProfile = useCallback(
    (next: Profile | null | ((prev: Profile | null) => Profile | null)) =>
      setChanged((prev) => {
        const value = typeof next === "function" ? next(prev === undefined ? stored : prev) : next;
        writeDemoSession(value);
        return value;
      }),
    [stored],
  );

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
  }, [setProfile]);

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

  const signOut = useCallback(() => setProfile(null), [setProfile]);

  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<boolean> => {
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
      return true;
    },
    [setProfile],
  );

  const value = useMemo(
    () =>
      contextValue(profile, {
        // Until hydrated the kept demo session is unknown, as a Supabase session is.
        restoring: !hydrated,
        realAuth: false,
        // Mock mode: a stable id per demo email, so each demo account keeps its own library.
        userId: profile ? `demo-${profile.email.trim().toLowerCase()}` : null,
        signInWithPassword,
        signUp,
        resendConfirmation,
        signIn,
        signOut,
        updateProfile,
      }),
    [profile, hydrated, signInWithPassword, signUp, resendConfirmation, signIn, signOut, updateProfile],
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
