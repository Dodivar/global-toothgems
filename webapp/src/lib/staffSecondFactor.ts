import { supabase } from "./supabase/client";

/**
 * Staff second factor (Supabase Auth MFA, TOTP in an authenticator app) — the
 * persistence boundary of `components/admin/StaffSecondFactor.tsx`.
 *
 * A staff member without a verified factor enrols one; with one, they are
 * challenged. Verifying a code raises the session to aal2, which the database
 * requires for every staff right (`private.is_staff()`,
 * `private.has_permission()`, migration `staff_mfa_required`).
 */

export type SecondFactorStep =
  | { kind: "enrol"; factorId: string; qrCode: string; secret: string }
  | { kind: "challenge"; factorId: string }
  | { kind: "unavailable" };

export type VerifyOutcome = "verified" | "wrongCode" | "tooMany" | "unavailable";

/** Shown as the account's name in the authenticator app. */
const ISSUER = "Global Toothgems";

/**
 * The challenge when the account has a verified factor; otherwise a fresh
 * enrolment, after removing any unverified factor an abandoned attempt left
 * (Supabase would refuse a second one with the same name).
 */
export async function prepareSecondFactor(): Promise<SecondFactorStep> {
  if (!supabase) return { kind: "unavailable" };
  const mfa = supabase.auth.mfa;
  const listed = await mfa.listFactors();
  if (listed.error || !listed.data) return { kind: "unavailable" };

  const verified = listed.data.totp.find((factor) => factor.status === "verified");
  if (verified) return { kind: "challenge", factorId: verified.id };

  for (const factor of listed.data.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      const removed = await mfa.unenroll({ factorId: factor.id });
      if (removed.error) return { kind: "unavailable" };
    }
  }

  const enrolled = await mfa.enroll({ factorType: "totp", issuer: ISSUER });
  if (enrolled.error || !enrolled.data) return { kind: "unavailable" };
  return { kind: "enrol", factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret };
}

/** Checks a 6-digit code; an enrolment's first code also verifies the factor. */
export async function verifySecondFactor(factorId: string, code: string): Promise<VerifyOutcome> {
  if (!supabase) return "unavailable";
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (!error) return "verified";
  if (error.status === 429) return "tooMany";
  return error.status === 400 || error.status === 422 ? "wrongCode" : "unavailable";
}
