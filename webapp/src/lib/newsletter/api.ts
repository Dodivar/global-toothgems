import { functionErrorCode, oneOf, readFunctionFailure } from "../supabase/functionError";
import { isSupabaseConfigured } from "../supabase/env";
import { requireSupabase } from "../supabase/client";
import { LEGAL_POLICY_VERSION } from "../registration";

/**
 * The newsletter's single persistence boundary for visitors (the screens never call Supabase):
 *   - sign-up: the Edge Function `newsletter-subscribe`. A signed-in member subscribing their own
 *     address, or a visitor whose captcha passed, is subscribed at once (`subscribed`); without a
 *     configured captcha a visitor gets the double opt-in e-mail (`sent`);
 *   - confirmation: `newsletter_confirm(token)`, open to visitors, with the token from that link.
 * Members also choose from their profile (a consent record, `lib/auth.tsx`).
 */

/** Where the form sits on the site (`newsletter_subscriptions.source`). */
export type NewsletterSource = "home" | "footer";

/** Codes the function answers with, plus the client's own. Each has a message under `newsletter.errors`. */
export const NEWSLETTER_ERRORS = [
  "rate_limited",
  "invalid_request",
  "captcha_required",
  "captcha_failed",
  "network",
  "unavailable",
  "server_error",
] as const;
export type NewsletterError = (typeof NEWSLETTER_ERRORS)[number];

const asError = (value: unknown): NewsletterError => oneOf(NEWSLETTER_ERRORS, value, "server_error");

export interface NewsletterSignup {
  email: string;
  locale: "fr" | "en";
  source: NewsletterSource;
  /** The box the visitor ticked: the function refuses a request without it. */
  consent: boolean;
  /** Honeypot: a field no person sees or fills. */
  website: string;
  /** Cloudflare Turnstile token, when the captcha is configured. */
  captcha?: string | null;
}

/** `subscribed`: on the list now. `sent`: a confirmation e-mail went out (no captcha configured). */
export type NewsletterOutcome = "subscribed" | "sent";

/** Same check as the database's, a little stricter on the domain. */
export const NEWSLETTER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Signs the address up. The answer is the same whether the address was new, pending or already
 * subscribed, so the form never tells. A signed-in member's session travels with the request.
 */
export async function subscribeToNewsletter(
  signup: NewsletterSignup,
): Promise<{ ok: true; outcome: NewsletterOutcome } | { ok: false; error: NewsletterError }> {
  // Never a pretend success: without the backend nothing is recorded, and the visitor is told.
  if (!isSupabaseConfigured) return { ok: false, error: "unavailable" };
  const { data, error } = await requireSupabase().functions.invoke("newsletter-subscribe", {
    body: {
      email: signup.email.trim(),
      locale: signup.locale,
      source: signup.source,
      consent: signup.consent,
      policy_version: LEGAL_POLICY_VERSION,
      website: signup.website,
      ...(signup.captcha ? { captcha: signup.captcha } : {}),
    },
  });
  if (!error) return { ok: true, outcome: (data as { status?: unknown } | null)?.status === "subscribed" ? "subscribed" : "sent" };
  const failure = await readFunctionFailure(error);
  if (failure.kind === "network") return { ok: false, error: "network" };
  if (failure.status === 404) return { ok: false, error: "unavailable" };
  if (failure.body === undefined) return { ok: false, error: "server_error" };
  return { ok: false, error: asError(functionErrorCode(failure.body)) };
}

/** The shape of the token the confirmation e-mail carries (48 hex characters). */
export const CONFIRM_TOKEN_RE = /^[0-9a-f]{48}$/;

export type ConfirmResult = "confirmed" | "invalid" | "unavailable" | "error";

/**
 * Confirms a subscription with the e-mailed token. `invalid` covers a wrong, used or expired
 * link alike (the database does not say which, on purpose).
 */
export async function confirmNewsletter(token: string): Promise<ConfirmResult> {
  if (!CONFIRM_TOKEN_RE.test(token)) return "invalid";
  if (!isSupabaseConfigured) return "unavailable";
  const { data, error } = await requireSupabase().rpc("newsletter_confirm", { p_token: token });
  if (error) return "error";
  return data === true ? "confirmed" : "invalid";
}
