import { supabase } from "./supabase/client";
import { RESET_PATH } from "./accountSecurity";
import { authConfirmUrl } from "./authRoutes";
import { isAuthRateLimit } from "./supabase/authErrors";
import { authCaptchaToken } from "./captcha/authCaptcha";

/**
 * Password recovery through Supabase Auth, used by `/mot-de-passe-oublie` and
 * `/reinitialiser-mot-de-passe` when Supabase is configured (the pages keep
 * their simulated service otherwise).
 *
 * Supabase answers a reset request the same way whether or not the address
 * has an account, so the page can confirm the send without revealing who is a
 * customer.
 */

type RecoveryRequestResult = "sent" | "rateLimited" | "failed";
type NewPasswordResult = "updated" | "weak" | "same" | "noSession" | "failed";

export async function sendPasswordReset(email: string): Promise<RecoveryRequestResult> {
  if (!supabase) return "failed";
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    // Through `/auth/confirm`, which opens the recovery session server-side.
    redirectTo: authConfirmUrl(RESET_PATH, window.location.origin),
    captchaToken: await authCaptchaToken(),
  });
  if (!error) return "sent";
  return isAuthRateLimit(error) ? "rateLimited" : "failed";
}

/** Sets the new password for the session opened by the recovery link, then closes it. */
export async function setNewPassword(password: string): Promise<NewPasswordResult> {
  if (!supabase) return "failed";
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") return "weak";
    if (error.code === "same_password") return "same";
    if (error.code === "session_not_found" || error.status === 401) return "noSession";
    return "failed";
  }
  // The member signs in again with the new password, which proves it works.
  await supabase.auth.signOut();
  return "updated";
}
