import { randomBytes } from "node:crypto";
import { ACCOUNTS, DEMO_MEMBER_ID, liveEnv, serviceClient, signedInClient, totpCode } from "./env";

/**
 * Prepares the local stack before any live test: one customer, one staff
 * member (role `admin`) with a freshly enrolled second factor (TOTP; its
 * secret travels through the environment, `E2E_STAFF_TOTP_SECRET`) and a
 * password for the seeded demo member, who owns real orders. Idempotent, so it can run again on a stack kept between runs.
 * The password is random per run and only travels through the environment.
 */
export default async function globalSetup() {
  liveEnv(); // fails fast on a missing or non-local configuration
  const password = `E2e-${randomBytes(9).toString("base64url")}!9a`;
  process.env.E2E_TEST_PASSWORD = password;

  const admin = serviceClient();
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`Cannot list the local stack's users: ${listError.message}`);
  const byEmail = new Map(list.users.map((u) => [u.email, u.id]));

  async function ensureUser(email: string, firstName: string): Promise<string> {
    const existing = byEmail.get(email);
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing, { password });
      if (error) throw new Error(`Cannot reset the password of ${email}: ${error.message}`);
      return existing;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: "E2E", terms_accepted: true, policy_version: "e2e", locale: "fr" },
    });
    if (error || !data.user) throw new Error(`Cannot create ${email}: ${error?.message}`);
    return data.user.id;
  }

  await ensureUser(ACCOUNTS.customer, "Client");
  const staffId = await ensureUser(ACCOUNTS.staff, "Équipe");
  const { error: roleError } = await admin.from("profiles").update({ role: "admin", status: "active" }).eq("id", staffId);
  if (roleError) throw new Error(`Cannot make ${ACCOUNTS.staff} a staff member: ${roleError.message}`);

  // Staff rights need the second factor: start from no factor (a stack kept
  // between runs keeps the last one), enrol one and verify it once.
  const factors = await admin.auth.admin.mfa.listFactors({ userId: staffId });
  if (factors.error) throw new Error(`Cannot list ${ACCOUNTS.staff}'s factors: ${factors.error.message}`);
  for (const factor of factors.data.factors) {
    const removed = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: staffId });
    if (removed.error) throw new Error(`Cannot remove a factor of ${ACCOUNTS.staff}: ${removed.error.message}`);
  }
  const staff = await signedInClient(ACCOUNTS.staff, password);
  const enrolled = await staff.auth.mfa.enroll({ factorType: "totp", issuer: "Global Toothgems E2E" });
  if (enrolled.error) throw new Error(`Cannot enrol ${ACCOUNTS.staff}'s second factor (is TOTP enabled in supabase/config.toml?): ${enrolled.error.message}`);
  const verified = await staff.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totpCode(enrolled.data.totp.secret) });
  if (verified.error) throw new Error(`Cannot verify ${ACCOUNTS.staff}'s second factor: ${verified.error.message}`);
  process.env.E2E_STAFF_TOTP_SECRET = enrolled.data.totp.secret;

  if (byEmail.get(ACCOUNTS.demo) !== DEMO_MEMBER_ID) {
    throw new Error("The demo member is missing: apply supabase/seed_demo_member.sql to the local stack (see docs/testing.md).");
  }
  const { error: demoError } = await admin.auth.admin.updateUserById(DEMO_MEMBER_ID, { password });
  if (demoError) throw new Error(`Cannot set the demo member's password: ${demoError.message}`);
}
