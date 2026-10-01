import { callerClient, requireEnv, serviceClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { handleStaffInvite, type Account, type DbError, type InviteDeps } from "./handler.ts";

const service = serviceClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));

interface ProfileRow {
  id: string;
  email: string | null;
  role: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  roles: { rank: number; is_staff: boolean } | null;
}

const PROFILE_COLUMNS = "id, email, role, status, first_name, last_name, roles ( rank, is_staff )";

/** `ilike` without wildcards: the address is matched exactly, whatever its case. */
const exactPattern = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

async function toAccount(row: ProfileRow | null): Promise<Account | null> {
  if (!row) return null;
  const { data, error } = await service.auth.admin.getUserById(row.id);
  if (error || !data.user) throw new Error(`auth user unreadable: ${error?.message ?? "missing"}`);
  const user = data.user;
  return {
    id: row.id,
    email: user.email ?? row.email ?? "",
    role: row.role,
    roleRank: row.roles?.rank ?? 0,
    roleIsStaff: row.roles?.is_staff === true,
    status: row.status,
    firstName: row.first_name,
    lastName: row.last_name,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    createdByInvitation: user.app_metadata?.staff_invitation === true,
  };
}

const asDbError = (error: { code?: string; message?: string } | null): DbError | null =>
  error ? { code: error.code, message: error.message } : null;

const deps: InviteDeps = {
  origins,

  async caller(token) {
    const { data, error } = await service.auth.getUser(token);
    if (error || !data.user) return null;
    const client = callerClient(token);
    // Both read with the caller's JWT: the database says what they may do.
    const [permissions, profile] = await Promise.all([
      client.rpc("my_permissions"),
      client.from("profiles").select("status, roles ( rank, is_staff )").eq("id", data.user.id).maybeSingle(),
    ]);
    if (permissions.error) throw new Error(permissions.error.message);
    if (profile.error) throw new Error(profile.error.message);
    const row = profile.data as { status: string; roles: { rank: number; is_staff: boolean } | null } | null;
    const rank = row?.status === "active" && row.roles?.is_staff ? row.roles.rank : 0;
    return { userId: data.user.id, permissions: new Set((permissions.data ?? []) as string[]), rank };
  },

  async staffRoleRank(role) {
    const { data, error } = await service.from("roles").select("rank, is_staff").eq("key", role).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.is_staff ? data.rank : null;
  },

  async findAccountByEmail(email) {
    const { data, error } = await service
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .ilike("email", exactPattern(email))
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return toAccount(data as unknown as ProfileRow | null);
  },

  async findAccountById(id) {
    const { data, error } = await service.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return toAccount(data as unknown as ProfileRow | null);
  },

  async sendInvitation(email, redirectTo, data) {
    const { data: result, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo, data });
    if (error) {
      if (error.status === 429 || error.code === "over_email_send_rate_limit") return { error: "rate_limited" };
      if (error.code === "email_exists" || error.status === 422) return { error: "exists", detail: error.message };
      return { error: "failed", detail: `${error.status ?? ""} ${error.code ?? ""} ${error.message}` };
    }
    return { userId: result.user.id };
  },

  async markInvitation(userId) {
    const { error } = await service.auth.admin.updateUserById(userId, { app_metadata: { staff_invitation: true } });
    if (error) throw new Error(error.message);
  },

  async assignRoleAsCaller(token, userId, values) {
    const { error } = await callerClient(token).from("profiles").update(values).eq("id", userId).select("id").single();
    return asDbError(error);
  },

  async saveStaffProfileAsCaller(token, userId, values) {
    const { error } = await callerClient(token)
      .from("staff_profiles")
      .upsert({ user_id: userId, ...values }, { onConflict: "user_id" })
      .select("user_id")
      .single();
    return asDbError(error);
  },

  async revokeAsCaller(token, userId) {
    const client = callerClient(token);
    const removed = await client.from("staff_profiles").delete().eq("user_id", userId);
    if (removed.error) return asDbError(removed.error);
    const { error } = await client.from("profiles").update({ role: "customer" }).eq("id", userId).select("id").single();
    return asDbError(error);
  },

  async deleteAccount(userId) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  },

  log: (message, detail) => console.error(`[invite-staff-member] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleStaffInvite(req, deps));
