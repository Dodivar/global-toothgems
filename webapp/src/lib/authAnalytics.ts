import { captureEvent, type AnalyticsProps } from "./analyticsCore";

/**
 * Sign-in, sign-up and password recovery outcomes, sent to PostHog (consent
 * rules in `analyticsCore.ts`). Only the method and the outcome code the
 * screens already use (`accepted`, `rejected`, `captcha`, `rateLimited`…):
 * never the e-mail typed. A refused password and a captcha refusal are told
 * apart, so a wave of `captcha` refusals (Turnstile misconfigured) shows at
 * once. Event list: `docs/academy-analytics.md` (Accounts).
 */

export type AuthEvent =
  /** Password or OAuth sign-in, with its outcome. */
  | "auth_sign_in"
  /** The browser left for Google or Apple (or could not). */
  | "auth_oauth_started"
  | "auth_sign_up"
  | "auth_confirmation_resent"
  | "auth_password_reset_requested";

export type AuthMethod = "email" | "google" | "apple";

export function trackAuth(event: AuthEvent, props: AnalyticsProps & { method?: AuthMethod; outcome?: string } = {}) {
  captureEvent(event, props);
}
