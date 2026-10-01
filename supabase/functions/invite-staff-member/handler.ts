import { corsHeaders, json, readJson, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import { parseStaffInviteInput, type InviteInput, type MemberActionInput, type StaffRole, type StaffTeam } from "./input.ts";

/**
 * POST /functions/v1/invite-staff-member
 *
 *   back office ──(caller's JWT + action)──▶ this function
 *
 *   1. the caller is authenticated from their JWT, then `my_permissions()` is
 *      called WITH THAT JWT: without `manage_users` nothing else happens (no
 *      lookup, so nothing is revealed about any address);
 *   2. the target role's rank is compared with the caller's own BEFORE any
 *      e-mail leaves (a manager never invites an administrator);
 *   3. `invite`:
 *        - no account for the address → `auth.admin.inviteUserByEmail()`
 *          (service role: the only step that needs it), marked as a staff
 *          invitation in app_metadata;
 *        - an existing, active customer → promoted, no e-mail (they keep
 *          their own password);
 *        - already a team member → `already_member` (the same pending
 *          invitation sent twice answers as the first one: idempotent);
 *      then the role, names and `staff_profiles` row are written WITH THE
 *      CALLER'S JWT, so RLS and `private.guard_profile_update()` /
 *      `guard_staff_profile()` apply the rank rules and audit the change.
 *      If that write is refused, an account this call just created is deleted
 *      again (it was never used).
 *   4. `resend`: a pending invitation (never signed in, e-mail unconfirmed) is
 *      sent again. Sending is a service-role call, so the rank rule is checked
 *      here explicitly.
 *   5. `cancel`: a pending invitation created by this function is withdrawn:
 *      staff row removed and role set back WITH THE CALLER'S JWT (the database
 *      checks rank and permission and audits it), then the unused auth account
 *      is deleted with the service role.
 *
 * Errors are short codes; SQL and Auth messages are logged, never returned.
 * Everything with side effects is injected (`InviteDeps`), so the flow is
 * tested without Supabase.
 */

export interface Caller {
  userId: string;
  /** `my_permissions()` read with the caller's JWT. */
  permissions: ReadonlySet<string>;
  /** Rank of the caller's role; 0 unless an active staff member. */
  rank: number;
}

export interface Account {
  id: string;
  email: string;
  role: string;
  roleRank: number;
  roleIsStaff: boolean;
  status: string;
  firstName: string | null;
  lastName: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  /** app_metadata.staff_invitation: the account was created by this function. */
  createdByInvitation: boolean;
}

export interface DbError {
  code?: string;
  message?: string;
}

export type InviteSendResult = { userId: string } | { error: "exists" | "rate_limited" | "failed"; detail?: unknown };

export interface ProfileAssignment {
  role: StaffRole;
  first_name?: string;
  last_name?: string;
}

export interface InviteDeps {
  origins: SiteOrigins;
  /** The verified caller behind a user JWT, or null when the token is not valid. */
  caller(token: string): Promise<Caller | null>;
  /** Rank of a staff role, read from `roles`; null when the key is not a staff role. */
  staffRoleRank(role: StaffRole): Promise<number | null>;
  findAccountByEmail(email: string): Promise<Account | null>;
  findAccountById(id: string): Promise<Account | null>;
  /** auth.admin.inviteUserByEmail (service role). */
  sendInvitation(email: string, redirectTo: string, data: { first_name?: string; last_name?: string }): Promise<InviteSendResult>;
  /** Marks a freshly invited account (app_metadata, not editable by the user). */
  markInvitation(userId: string): Promise<void>;
  /** UPDATE profiles with the caller's JWT (RLS + guard_profile_update). */
  assignRoleAsCaller(token: string, userId: string, values: ProfileAssignment): Promise<DbError | null>;
  /** UPSERT staff_profiles with the caller's JWT (RLS + guard_staff_profile). */
  saveStaffProfileAsCaller(token: string, userId: string, values: { team: StaffTeam; job_title: string | null }): Promise<DbError | null>;
  /** DELETE staff_profiles + role back to customer, with the caller's JWT. */
  revokeAsCaller(token: string, userId: string): Promise<DbError | null>;
  /** auth.admin.deleteUser (service role). */
  deleteAccount(userId: string): Promise<void>;
  log(message: string, detail?: unknown): void;
}

export type InviteErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "rank_forbidden"
  | "already_member"
  | "account_unavailable"
  | "not_pending"
  | "not_found"
  | "rate_limited"
  | "server_error";

const STATUS: Record<InviteErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  rank_forbidden: 403,
  already_member: 409,
  account_unavailable: 409,
  not_pending: 409,
  not_found: 404,
  rate_limited: 429,
  server_error: 500,
};

const MAX_BODY_BYTES = 8 * 1024;

/** Where the invitation link lands: `/auth/confirm` opens the session, then the invitee chooses a password. */
export const INVITE_LANDING = "/reinitialiser-mot-de-passe";

export function invitationRedirect(origin: string): string {
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("next", INVITE_LANDING);
  return url.toString();
}

function bearer(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

const looksLikeJwt = (token: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);

/** A refusal from RLS or a guard trigger (or an UPDATE that matched no row). */
function refusal(error: DbError): InviteErrorCode | null {
  if (error.code === "42501") return /rank|above your own/.test(error.message ?? "") ? "rank_forbidden" : "forbidden";
  if (error.code === "PGRST116") return "forbidden"; // no row visible / updated under the caller's RLS
  return null;
}

/** A pending invitation: never signed in, address never confirmed. */
const isPending = (account: Account) => account.roleIsStaff && account.lastSignInAt === null && account.emailConfirmedAt === null;

export async function handleStaffInvite(req: Request, deps: InviteDeps): Promise<Response> {
  const requestOrigin = req.headers.get("origin");
  const cors = corsHeaders(deps.origins, requestOrigin);
  const fail = (code: InviteErrorCode) => json({ error: code }, STATUS[code], cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  // Authentication and authorization first: an unauthorized caller learns
  // nothing, not even whether their request was well formed.
  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return fail("unauthorized");
  let caller: Caller | null;
  try {
    caller = await deps.caller(token);
  } catch (error) {
    deps.log("caller check failed", error instanceof Error ? error.message : error);
    return fail("server_error");
  }
  if (!caller) return fail("unauthorized");
  if (!caller.permissions.has("manage_users")) return fail("forbidden");

  const parsed = parseStaffInviteInput(await readJson(req, MAX_BODY_BYTES));
  if (!parsed.ok) return json({ error: "invalid_request", field: parsed.field }, 400, cors);

  try {
    const input = parsed.value;
    if (input.action === "invite") {
      return await invite(input, token, caller, returnOrigin(deps.origins, requestOrigin), deps, fail, cors);
    }
    return await memberAction(input, token, caller, returnOrigin(deps.origins, requestOrigin), deps, fail, cors);
  } catch (error) {
    deps.log("unexpected failure", error instanceof Error ? error.message : error);
    return fail("server_error");
  }
}

type Fail = (code: InviteErrorCode) => Response;

async function invite(
  input: InviteInput,
  token: string,
  caller: Caller,
  origin: string,
  deps: InviteDeps,
  fail: Fail,
  cors: Record<string, string>,
): Promise<Response> {
  const targetRank = await deps.staffRoleRank(input.role);
  if (targetRank === null) return fail("invalid_request");
  // Checked before any e-mail is sent; the database checks it again on the write.
  if (targetRank > caller.rank) return fail("rank_forbidden");

  const existing = await deps.findAccountByEmail(input.email);

  if (existing?.roleIsStaff) {
    // The same invitation sent twice (a retry) answers like the first one.
    if (isPending(existing) && existing.createdByInvitation && existing.role === input.role) {
      return json({ status: "invited", user_id: existing.id }, 200, cors);
    }
    return fail("already_member");
  }

  if (existing) {
    // A customer account: promoted in place, no e-mail (they keep their password).
    if (existing.id === caller.userId) return fail("forbidden");
    if (existing.status !== "active") return fail("account_unavailable");
    const assignment: ProfileAssignment = {
      role: input.role,
      // Their own names are kept; only empty ones are filled in.
      ...(existing.firstName ? {} : { first_name: input.first_name }),
      ...(existing.lastName ? {} : { last_name: input.last_name }),
    };
    const refused = await writeAsCaller(token, existing.id, assignment, input, deps);
    if (refused) return fail(refused);
    return json({ status: "promoted", user_id: existing.id }, 200, cors);
  }

  const sent = await deps.sendInvitation(input.email, invitationRedirect(origin), {
    first_name: input.first_name,
    last_name: input.last_name,
  });
  if ("error" in sent) {
    if (sent.error === "rate_limited") return fail("rate_limited");
    // Created between our lookup and the invitation: the caller retries and gets the real answer.
    if (sent.error === "exists") return fail("already_member");
    deps.log("invitation not sent", sent.detail);
    return fail("server_error");
  }

  try {
    await deps.markInvitation(sent.userId);
  } catch (error) {
    deps.log("invitation mark not written", error instanceof Error ? error.message : error);
  }
  const refused = await writeAsCaller(
    token,
    sent.userId,
    { role: input.role, first_name: input.first_name, last_name: input.last_name },
    input,
    deps,
  );
  if (refused) {
    // The account was created by this call and never used: remove it rather
    // than leave an invited customer nobody asked for.
    try {
      await deps.deleteAccount(sent.userId);
    } catch (error) {
      deps.log("rollback of the invited account failed", error instanceof Error ? error.message : error);
    }
    return fail(refused);
  }
  return json({ status: "invited", user_id: sent.userId }, 200, cors);
}

/** Role then staff details, both under the caller's RLS. Returns the refusal code, if any. */
async function writeAsCaller(
  token: string,
  userId: string,
  assignment: ProfileAssignment,
  input: InviteInput,
  deps: InviteDeps,
): Promise<InviteErrorCode | null> {
  const roleError = await deps.assignRoleAsCaller(token, userId, assignment);
  if (roleError) {
    const code = refusal(roleError);
    if (!code) deps.log("role assignment failed", roleError);
    return code ?? "server_error";
  }
  const staffError = await deps.saveStaffProfileAsCaller(token, userId, { team: input.team, job_title: input.job_title });
  if (staffError) {
    const code = refusal(staffError);
    if (!code) deps.log("staff profile not saved", staffError);
    return code ?? "server_error";
  }
  return null;
}

async function memberAction(
  input: MemberActionInput,
  token: string,
  caller: Caller,
  origin: string,
  deps: InviteDeps,
  fail: Fail,
  cors: Record<string, string>,
): Promise<Response> {
  const account = await deps.findAccountById(input.user_id);
  // A customer id answers like an unknown one: this function only knows the team.
  if (!account || !account.roleIsStaff) return fail("not_found");
  if (account.id === caller.userId) return fail("forbidden");
  // Explicit rank check: sending and deleting are service-role calls.
  if (account.roleRank > caller.rank) return fail("rank_forbidden");
  if (!isPending(account)) return fail("not_pending");

  if (input.action === "resend") {
    const sent = await deps.sendInvitation(account.email, invitationRedirect(origin), {});
    if ("error" in sent) {
      if (sent.error === "rate_limited") return fail("rate_limited");
      if (sent.error === "exists") return fail("not_pending"); // accepted in the meantime
      deps.log("invitation not resent", sent.detail);
      return fail("server_error");
    }
    return json({ status: "resent", user_id: account.id }, 200, cors);
  }

  // cancel: only an account this function created, so a customer's own
  // account is never deleted by withdrawing their promotion.
  if (!account.createdByInvitation) return fail("not_pending");
  const revokeError = await deps.revokeAsCaller(token, account.id);
  if (revokeError) {
    const code = refusal(revokeError);
    if (!code) deps.log("revocation failed", revokeError);
    return fail(code ?? "server_error");
  }
  await deps.deleteAccount(account.id);
  return json({ status: "cancelled", user_id: account.id }, 200, cors);
}
