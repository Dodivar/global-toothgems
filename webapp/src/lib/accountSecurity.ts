import { useCallback, useEffect, useState } from "react";
import { PASSWORD_RULES, TAKEN_EMAILS, isCommonPassword, passwordRuleMet } from "./registration";

/**
 * Account recovery and account security: the simulated service and the state
 * the Security & privacy page reads.
 *
 * Front-end prototype only, in the same spirit as `lib/registration.ts`. No
 * email is sent, no password is checked or stored, no archive is generated on a
 * server and no account is deleted: each operation is a timed promise whose
 * outcome a reviewer picks from the page's demo panel. The session-level
 * state (pending email, export status…) lives in `securityState.tsx`. Real recovery goes
 * through Supabase Auth (reset and verification links, rate limiting, session
 * revocation) and the export and deletion requests through server-side jobs —
 * none of which may be modelled on this file. Client-side checks here are for
 * guidance only; the server re-checks everything.
 */

/* ------------------------------------------------------------------ */
/* Timings and demo values                                            */
/* ------------------------------------------------------------------ */

/** How long a reset link stays valid, in minutes. Shown in the copy. */
export const RESET_LINK_MINUTES = 60;

/** How long an email-verification link stays valid, in hours. */
export const VERIFY_LINK_HOURS = 24;

/** How long a generated data archive stays downloadable, in days. */
export const EXPORT_AVAILABLE_DAYS = 7;

/** Seconds the resend buttons stay locked after a send. */
export const SECURITY_RESEND_COOLDOWN = 30;

/**
 * The password the demo account "has". The login form is prefilled with it,
 * so the reviewer already knows it; any other value is treated as wrong by the
 * change-email and change-password forms.
 */
export const DEMO_CURRENT_PASSWORD = "gemstudio";

/**
 * Word typed to confirm deletion. Localised in the UI (`security.delete.phrase`),
 * because asking a French speaker to type an English word is a comprehension
 * test, not a confirmation.
 */
export function deletionPhraseMatches(typed: string, phrase: string): boolean {
  return typed.trim().toLocaleUpperCase() === phrase.toLocaleUpperCase();
}

/* ------------------------------------------------------------------ */
/* Links carried in the (mock) emails                                 */
/* ------------------------------------------------------------------ */

/**
 * Tokens the prototype recognises in `?jeton=`. A real link carries an opaque,
 * single-use token checked by the server; here the token names the outcome so a
 * reviewer can open every state from a URL.
 */
export const LINK_TOKENS = {
  valid: "demo-valide",
  expired: "demo-expire",
  invalid: "demo-invalide",
  alreadyVerified: "demo-deja-verifie",
} as const;

export type ResetLinkState = "valid" | "expired" | "invalid";
export type VerifyOutcome = "verified" | "expired" | "invalid" | "alreadyVerified";

export function resetLinkStateOf(token: string | null): ResetLinkState {
  if (token === LINK_TOKENS.expired) return "expired";
  if (!token || token === LINK_TOKENS.invalid) return "invalid";
  return "valid";
}

export function verifyOutcomeOf(token: string | null): VerifyOutcome {
  if (token === LINK_TOKENS.expired) return "expired";
  if (token === LINK_TOKENS.alreadyVerified) return "alreadyVerified";
  if (!token || token === LINK_TOKENS.invalid) return "invalid";
  return "verified";
}

export const RESET_PATH = "/reinitialiser-mot-de-passe";
export const VERIFY_PATH = "/verifier-email";
export const FORGOT_PATH = "/mot-de-passe-oublie";

/** `kind=changement` marks a link confirming a new address rather than a first one. */
export function verifyLink(token: string, kind: "inscription" | "changement" = "inscription") {
  return `${VERIFY_PATH}?jeton=${token}${kind === "changement" ? "&type=changement" : ""}`;
}

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Error key for a new password, or null. Same policy as registration. */
export function newPasswordError(value: string): string | null {
  if (!value) return "security.errors.newPasswordRequired";
  if (isCommonPassword(value)) return "register.errors.passwordCommon";
  if (!PASSWORD_RULES.every((rule) => passwordRuleMet(rule, value))) return "register.errors.passwordWeak";
  return null;
}

/* ------------------------------------------------------------------ */
/* Simulated service                                                  */
/* ------------------------------------------------------------------ */

/**
 * Outcome of the next server call, chosen in a demo panel. "success" is the
 * normal path; "serverError" makes the next call fail as a server would, so
 * the error state and its recovery can be reviewed.
 */
export type ServiceOutcome = "success" | "serverError";

export class SecurityServiceError extends Error {
  code: "server" | "emailTaken" | "wrongPassword";
  constructor(code: SecurityServiceError["code"]) {
    super(code);
    this.code = code;
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(ms: number, outcome: ServiceOutcome) {
  await wait(ms);
  if (outcome === "serverError") throw new SecurityServiceError("server");
}

/**
 * The response never says whether an account exists for the address: saying
 * so would let anyone probe which emails are customers. The page therefore
 * confirms the send in every case, with wording that stays true when no
 * account matches.
 */
export async function requestPasswordReset(_email: string, outcome: ServiceOutcome) {
  await call(1100, outcome);
}

export async function resetPassword(_password: string, outcome: ServiceOutcome) {
  await call(1300, outcome);
}

export async function sendVerification(outcome: ServiceOutcome) {
  await call(1000, outcome);
}

export async function confirmVerification() {
  await wait(1600);
}

export async function requestEmailChange(newEmail: string, currentPassword: string, outcome: ServiceOutcome) {
  await wait(1200);
  if (outcome === "serverError") throw new SecurityServiceError("server");
  if (currentPassword !== DEMO_CURRENT_PASSWORD) throw new SecurityServiceError("wrongPassword");
  if (TAKEN_EMAILS.includes(newEmail.trim().toLowerCase())) throw new SecurityServiceError("emailTaken");
}

export async function changePassword(currentPassword: string, _next: string, outcome: ServiceOutcome) {
  await wait(1300);
  if (outcome === "serverError") throw new SecurityServiceError("server");
  if (currentPassword !== DEMO_CURRENT_PASSWORD) throw new SecurityServiceError("wrongPassword");
}

export async function submitExportRequest(outcome: ServiceOutcome) {
  await call(1100, outcome);
}

export async function deleteAccount(outcome: ServiceOutcome) {
  await call(1800, outcome);
}

/* ------------------------------------------------------------------ */
/* Resend cooldown                                                    */
/* ------------------------------------------------------------------ */

/** Seconds left before a resend is allowed; `start()` locks it again. */
export function useCooldown(seconds = SECURITY_RESEND_COOLDOWN) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  const start = useCallback(() => setLeft(seconds), [seconds]);
  return { left, start };
}

export function formatCountdown(seconds: number) {
  return `0:${String(seconds).padStart(2, "0")}`;
}
