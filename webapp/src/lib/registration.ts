/**
 * Registration journey: validation rules, password strength, context and the
 * simulated account service.
 *
 * Front-end prototype only. Nothing here creates an account, stores a password
 * or sends an email: the "service" is a set of timed promises whose outcome is
 * chosen by the demo scenario, so every state of the journey can be reviewed.
 * Real registration goes through Supabase Auth, which owns password hashing,
 * rate limiting and verification links — none of that may be modelled on this
 * file. The client-side rules below are for guidance only; the server re-checks.
 */

export type StepId = "account" | "profile" | "preferences" | "done";

export const STEPS: StepId[] = ["account", "profile", "preferences", "done"];

/* ------------------------------------------------------------------ */
/* Context                                                            */
/* ------------------------------------------------------------------ */

/**
 * Why the visitor is creating an account. It decides the summary shown beside
 * the form and the primary action once the account exists, and nothing else:
 * the fields and the rules are the same for everyone.
 */
export type RegistrationContext =
  | { kind: "general" }
  | { kind: "purchase"; productId?: string; qty?: number }
  | { kind: "training"; courseId: string };

export type ContextKind = RegistrationContext["kind"];

/** URL values, in French like the rest of the site's paths. */
const CONTEXT_PARAM: Record<ContextKind, string> = {
  general: "compte",
  purchase: "achat",
  training: "formation",
};

export function contextParam(kind: ContextKind): string {
  return CONTEXT_PARAM[kind];
}

/**
 * Reads the context from the query string first (shareable, survives a reload)
 * and from history state second (what the login wall and the course page pass).
 */
export function resolveContext(
  params: URLSearchParams,
  state: { from?: string; course?: string } | null,
): RegistrationContext {
  const kind = params.get("contexte");
  if (kind === CONTEXT_PARAM.training) {
    return { kind: "training", courseId: params.get("formation") ?? state?.course ?? "fondation" };
  }
  if (kind === CONTEXT_PARAM.purchase) {
    const qty = Number(params.get("qte"));
    return {
      kind: "purchase",
      productId: params.get("produit") ?? undefined,
      qty: Number.isInteger(qty) && qty > 0 ? qty : undefined,
    };
  }
  if (kind === CONTEXT_PARAM.general) return { kind: "general" };

  if (state?.course) return { kind: "training", courseId: state.course };
  if (state?.from?.startsWith("/panier")) return { kind: "purchase" };
  return { kind: "general" };
}

/* ------------------------------------------------------------------ */
/* Countries                                                          */
/* ------------------------------------------------------------------ */

/**
 * Countries offered at registration, with their dialling code for the phone
 * hint. Wider than `DELIVERY_COUNTRIES`: training is sold worldwide, while
 * physical products ship to four countries. Labels come from `Intl.DisplayNames`
 * in the UI language, so no country name is hard-coded in either locale.
 */
export const REGISTRATION_COUNTRIES: { code: string; dial: string }[] = [
  { code: "FR", dial: "+33" },
  { code: "BE", dial: "+32" },
  { code: "CH", dial: "+41" },
  { code: "LU", dial: "+352" },
  { code: "DE", dial: "+49" },
  { code: "AT", dial: "+43" },
  { code: "NL", dial: "+31" },
  { code: "IE", dial: "+353" },
  { code: "GB", dial: "+44" },
  { code: "ES", dial: "+34" },
  { code: "PT", dial: "+351" },
  { code: "IT", dial: "+39" },
  { code: "PL", dial: "+48" },
  { code: "SE", dial: "+46" },
  { code: "DK", dial: "+45" },
  { code: "GR", dial: "+30" },
  { code: "MA", dial: "+212" },
  { code: "AE", dial: "+971" },
  { code: "US", dial: "+1" },
  { code: "CA", dial: "+1" },
  { code: "BR", dial: "+55" },
  { code: "AU", dial: "+61" },
];

export function dialCodeOf(code: string): string | undefined {
  return REGISTRATION_COUNTRIES.find((c) => c.code === code)?.dial;
}

export function countryName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/* ------------------------------------------------------------------ */
/* Form data                                                          */
/* ------------------------------------------------------------------ */

export type Persona = "artist" | "student" | "customer" | "other";
export type Interest = "products" | "training" | "community" | "all";

export const PERSONAS: Persona[] = ["artist", "student", "customer", "other"];
export const INTERESTS: Interest[] = ["products", "training", "community", "all"];

export interface RegistrationData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  country: string;
  phone: string;
  persona: Persona | null;
  interest: Interest | null;
  terms: boolean;
  marketing: boolean;
}

export const EMPTY_REGISTRATION: RegistrationData = {
  email: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  lastName: "",
  country: "",
  phone: "",
  persona: null,
  interest: null,
  terms: false,
  // Never pre-checked: marketing consent is opt-in and separate from the account.
  marketing: false,
};

export type FieldName = keyof RegistrationData;

/** An error is a translation key; the component renders it. */
export type Errors = Partial<Record<FieldName, string>>;

/* ------------------------------------------------------------------ */
/* Rules                                                              */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Frequent typos of the big mailbox domains, offered as a one-click fix. */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.fr": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

export function suggestEmail(email: string): string | null {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return null;
  const fix = DOMAIN_TYPOS[domain];
  return fix ? `${local}@${fix}` : null;
}

export const MIN_PASSWORD = 8;

/**
 * Rules shown under every new-password field — registration, reset and change
 * — in the order they are usually met. One policy for the whole product: a
 * password accepted at sign-up must not be refused by the reset form.
 */
export type PasswordRule = "length" | "lowercase" | "uppercase" | "number" | "special";

export const PASSWORD_RULES: PasswordRule[] = ["length", "lowercase", "uppercase", "number", "special"];

export function passwordRuleMet(rule: PasswordRule, value: string): boolean {
  switch (rule) {
    case "length":
      return value.length >= MIN_PASSWORD;
    case "lowercase":
      return /[a-z]/.test(value);
    case "uppercase":
      return /[A-Z]/.test(value);
    case "number":
      return /\d/.test(value);
    case "special":
      return /[^A-Za-z0-9\s]/.test(value);
  }
}

/** A handful of the passwords every breach list opens with. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "azerty123",
  "azertyuiop",
  "qwerty123",
  "12345678",
  "123456789",
  "motdepasse",
  "motdepasse1",
  "iloveyou1",
  "welcome1",
  "toothgems",
  "toothgems1",
]);

export function isCommonPassword(value: string): boolean {
  return COMMON_PASSWORDS.has(value.toLowerCase());
}

/** 0 = empty, 1 = too weak, 2 = fair, 3 = good, 4 = strong. */
export type Strength = 0 | 1 | 2 | 3 | 4;

export function passwordStrength(value: string): Strength {
  if (!value) return 0;
  if (isCommonPassword(value)) return 1;
  const met = PASSWORD_RULES.filter((r) => passwordRuleMet(r, value)).length;
  if (met < PASSWORD_RULES.length) return met >= 3 ? 2 : 1;
  return value.length >= 12 ? 4 : 3;
}

export const STRENGTH_KEYS: Record<Strength, string> = {
  0: "register.strength.empty",
  1: "register.strength.weak",
  2: "register.strength.fair",
  3: "register.strength.good",
  4: "register.strength.strong",
};

function normalisedPhone(value: string): string {
  return value.replace(/[\s.\-()]/g, "");
}

/* Per-field validators return an error key, or null. */

export function validateField(name: FieldName, data: RegistrationData): string | null {
  switch (name) {
    case "email": {
      const v = data.email.trim();
      if (!v) return "register.errors.emailRequired";
      if (!EMAIL_RE.test(v)) return "register.errors.emailInvalid";
      return null;
    }
    case "password": {
      if (!data.password) return "register.errors.passwordRequired";
      if (isCommonPassword(data.password)) return "register.errors.passwordCommon";
      if (!PASSWORD_RULES.every((r) => passwordRuleMet(r, data.password))) return "register.errors.passwordWeak";
      return null;
    }
    case "confirmPassword": {
      if (!data.confirmPassword) return "register.errors.confirmRequired";
      if (data.confirmPassword !== data.password) return "register.errors.confirmMismatch";
      return null;
    }
    case "firstName":
      return data.firstName.trim() ? null : "register.errors.firstNameRequired";
    case "lastName":
      return data.lastName.trim() ? null : "register.errors.lastNameRequired";
    case "country":
      if (!data.country) return "register.errors.countryRequired";
      return REGISTRATION_COUNTRIES.some((c) => c.code === data.country) ? null : "register.errors.countryInvalid";
    case "phone": {
      const v = normalisedPhone(data.phone);
      if (!v) return null;
      if (!/^\+?\d+$/.test(v)) return "register.errors.phoneCharacters";
      const digits = v.replace("+", "").length;
      if (digits < 6 || digits > 15) return "register.errors.phoneLength";
      return null;
    }
    case "terms":
      return data.terms ? null : "register.errors.termsRequired";
    default:
      return null;
  }
}

/**
 * Fields validated on each step. An account created with Google has no
 * password on this side: Google already authenticated the address.
 */
export function fieldsForStep(step: StepId, viaGoogle: boolean): FieldName[] {
  switch (step) {
    case "account":
      return viaGoogle ? ["email"] : ["email", "password", "confirmPassword"];
    case "profile":
      return ["firstName", "lastName", "country", "phone"];
    case "preferences":
      return ["terms"];
    default:
      return [];
  }
}

export function validateStep(step: StepId, data: RegistrationData, viaGoogle: boolean): Errors {
  const errors: Errors = {};
  for (const field of fieldsForStep(step, viaGoogle)) {
    const error = validateField(field, data);
    if (error) errors[field] = error;
  }
  return errors;
}

/** "camille.roussel@studio.fr" -> "c••••••••l@studio.fr" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `${local.charAt(0)}•@${domain}`;
  return `${local.charAt(0)}${"•".repeat(Math.min(8, local.length - 2))}${local.charAt(local.length - 1)}@${domain}`;
}

/* ------------------------------------------------------------------ */
/* Simulated service                                                  */
/* ------------------------------------------------------------------ */

/**
 * Outcomes a reviewer can force from the prototype panel. "success" is the
 * default path; each other value breaks exactly one step so its state can be
 * seen without guessing which input triggers it.
 */
export type Scenario = "success" | "registrationFails" | "networkError" | "emailFails" | "linkExpired";

export const SCENARIOS: Scenario[] = ["success", "registrationFails", "networkError", "emailFails", "linkExpired"];

/** Addresses the mock treats as already registered. */
export const TAKEN_EMAILS = ["camille@studio.fr", "hello@globaltoothgems.com", "lea.martin@gmail.com"];

/** How long the resend button stays locked after a send, in seconds. */
export const RESEND_COOLDOWN = 30;

export type RegistrationErrorCode = "emailTaken" | "network" | "server" | "emailSend";

export class RegistrationError extends Error {
  code: RegistrationErrorCode;
  constructor(code: RegistrationErrorCode) {
    super(code);
    this.code = code;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function checkEmailAvailable(email: string): Promise<boolean> {
  await wait(650);
  return !TAKEN_EMAILS.includes(email.trim().toLowerCase());
}

export async function createAccount(data: RegistrationData, scenario: Scenario): Promise<void> {
  await wait(1400);
  if (scenario === "networkError") throw new RegistrationError("network");
  if (scenario === "registrationFails") throw new RegistrationError("server");
  if (TAKEN_EMAILS.includes(data.email.trim().toLowerCase())) throw new RegistrationError("emailTaken");
}

/** `attempt` starts at 1; the "emailFails" scenario fails only the first send. */
export async function sendVerificationEmail(scenario: Scenario, attempt: number): Promise<void> {
  await wait(attempt === 1 ? 500 : 1100);
  if (scenario === "emailFails" && attempt === 1) throw new RegistrationError("emailSend");
}

export async function verifyLink(scenario: Scenario, linkNumber: number): Promise<"verified" | "expired"> {
  await wait(900);
  // The expired scenario expires the first link only, so the recovery path —
  // "send a new link" — can be completed.
  return scenario === "linkExpired" && linkNumber === 1 ? "expired" : "verified";
}
