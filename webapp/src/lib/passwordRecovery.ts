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
