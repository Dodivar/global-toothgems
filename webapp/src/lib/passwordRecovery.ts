import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";
import { RESET_PATH } from "./accountSecurity";

/**
 * Password recovery through Supabase Auth, used by `/mot-de-passe-oublie` and
 * `/reinitialiser-mot-de-passe` when Supabase is configured (the pages keep
 * their simulated service otherwise).
 *
 * Supabase answers a reset request the same way whether or not the address
 * has an account, so the page can confirm the send without revealing who is a
 * customer.
 */

export type RecoveryRequestResult = "sent" | "rateLimited" | "failed";
export type NewPasswordResult = "updated" | "weak" | "same" | "noSession" | "failed";

const isRateLimit = (error: AuthError) =>
  error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit";

export async function sendPasswordReset(email: string): Promise<RecoveryRequestResult> {
  if (!supabase) return "failed";
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: new URL(RESET_PATH, window.location.origin).toString(),
  });
  if (!error) return "sent";
  return isRateLimit(error) ? "rateLimited" : "failed";
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

export type PasswordChangeResult = "updated" | "wrongPassword" | "weak" | "same" | "rateLimited" | "failed";

/**
 * Changes the signed-in member's password from the Security page.
 *
 * `updateUser` alone does not check the current password (it only does when the
 * project turns on "secure password change"), so the current one is verified
 * first by signing in again with it. A wrong password leaves the open session
 * untouched; a right one refreshes it, which also satisfies Supabase's
 * recent-login requirement for the update.
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<PasswordChangeResult> {
  if (!supabase) return "failed";
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) return "failed";

  const check = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (check.error) {
    if (isRateLimit(check.error)) return "rateLimited";
    return check.error.code === "invalid_credentials" || check.error.status === 400 ? "wrongPassword" : "failed";
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    if (error.code === "weak_password") return "weak";
    if (error.code === "same_password") return "same";
    if (isRateLimit(error)) return "rateLimited";
    return "failed";
  }
  return "updated";
}
