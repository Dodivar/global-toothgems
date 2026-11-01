import { supabase } from "./supabase/client";
import { VERIFY_PATH } from "./accountSecurity";
import { authConfirmUrl } from "./authRoutes";
import { isAuthRateLimit } from "./supabase/authErrors";

/**
 * Changing the sign-in credentials of the signed-in member through Supabase
 * Auth, used by the Security & privacy page when Supabase is configured (the
 * cards keep their simulated service otherwise).
 *
 * `updateUser` does not check the current password (it only does when the
 * project turns on "secure password change"), so both changes first verify it
 * by signing in again with it. A wrong password leaves the open session
 * untouched; a right one refreshes it, which also satisfies Supabase's
 * recent-login requirement for the update.
 */

type PasswordChangeResult = "updated" | "wrongPassword" | "weak" | "same" | "rateLimited" | "failed";
type EmailChangeResult = "sent" | "wrongPassword" | "emailTaken" | "rateLimited" | "failed";
type EmailResendResult = "sent" | "rateLimited" | "failed";

/** Where the links confirming an email change land, through `/auth/confirm`. */
function emailChangeRedirect(): string {
  return authConfirmUrl(`${VERIFY_PATH}?type=changement`, window.location.origin);
}

type Verified = { ok: true } | { ok: false; result: "wrongPassword" | "rateLimited" | "failed" };

async function verifyCurrentPassword(currentPassword: string): Promise<Verified> {
  if (!supabase) return { ok: false, result: "failed" };
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return { ok: false, result: "failed" };

  const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (!error) return { ok: true };
  if (isAuthRateLimit(error)) return { ok: false, result: "rateLimited" };
  return { ok: false, result: error.code === "invalid_credentials" || error.status === 400 ? "wrongPassword" : "failed" };
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<PasswordChangeResult> {
  const verified = await verifyCurrentPassword(currentPassword);
  if (!verified.ok) return verified.result;

  const { error } = await supabase!.auth.updateUser({ password: newPassword });
  if (error) {
    if (error.code === "weak_password") return "weak";
    if (error.code === "same_password") return "same";
    if (isAuthRateLimit(error)) return "rateLimited";
    return "failed";
  }
  return "updated";
}

/**
 * Starts an email change. Supabase keeps the current address as the sign-in
 * email and emails a confirmation link; with "secure email change" (on by
 * default) both the old and the new address get one, and both must be opened.
 */
export async function requestOwnEmailChange(newEmail: string, currentPassword: string): Promise<EmailChangeResult> {
  const verified = await verifyCurrentPassword(currentPassword);
  if (!verified.ok) return verified.result;

  const { error } = await supabase!.auth.updateUser(
    { email: newEmail.trim() },
    { emailRedirectTo: emailChangeRedirect() },
  );
  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") return "emailTaken";
    if (isAuthRateLimit(error)) return "rateLimited";
    return "failed";
  }
  return "sent";
}

export async function resendEmailChangeLink(newEmail: string): Promise<EmailResendResult> {
  if (!supabase) return "failed";
  const { error } = await supabase.auth.resend({
    type: "email_change",
    email: newEmail,
    options: { emailRedirectTo: emailChangeRedirect() },
  });
  if (!error) return "sent";
  return isAuthRateLimit(error) ? "rateLimited" : "failed";
}

/**
 * The address an email change is waiting on, read from Supabase rather than
 * from memory: a change stays pending server-side across reloads and devices.
 * `undefined` when it cannot be read.
 */
export async function readEmailChange(): Promise<{ email: string | null; pending: string | null } | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return undefined;
  return { email: data.user.email ?? null, pending: data.user.new_email || null };
}
