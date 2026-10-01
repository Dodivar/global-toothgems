import { assert, assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { handleStaffInvite, invitationRedirect, type Account, type Caller, type DbError, type InviteDeps } from "./handler.ts";

const ADMIN: Caller = { userId: "aaaaaaaa-0000-4000-8000-000000000001", permissions: new Set(["view_users", "manage_users", "manage_settings"]), rank: 30 };
const MANAGER: Caller = { userId: "aaaaaaaa-0000-4000-8000-000000000002", permissions: new Set(["view_users", "manage_users"]), rank: 20 };
const VIEWER: Caller = { userId: "aaaaaaaa-0000-4000-8000-000000000003", permissions: new Set(["view_users"]), rank: 10 };
const TOKENS: Record<string, Caller> = { "admin.jwt.sig": ADMIN, "manager.jwt.sig": MANAGER, "viewer.jwt.sig": VIEWER };
const RANKS: Record<string, number> = { viewer: 10, manager: 20, admin: 30 };

const NEW_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const INVITE = {
  action: "invite",
  email: "Nora.Martin@Example.com",
  first_name: "Nora",
  last_name: "Martin",
  role: "manager",
  team: "customer_care",
  job_title: "Responsable service client",
};

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "cccccccc-0000-4000-8000-000000000001",
    email: "nora.martin@example.com",
    role: "customer",
    roleRank: 0,
    roleIsStaff: false,
    status: "active",
    firstName: "Nora",
    lastName: null,
    lastSignInAt: "2026-09-01T10:00:00Z",
    emailConfirmedAt: "2026-09-01T10:00:00Z",
    createdByInvitation: false,
    ...overrides,
  };
}

const PENDING = account({
  id: "dddddddd-0000-4000-8000-000000000001",
  role: "manager",
  roleRank: 20,
  roleIsStaff: true,
  lastSignInAt: null,
  emailConfirmedAt: null,
  createdByInvitation: true,
});

function fakeDeps(overrides: Partial<InviteDeps> = {}, accounts: Account[] = []) {
  const calls = {
    lookups: 0,
    sent: [] as { email: string; redirectTo: string }[],
    marked: [] as string[],
    roles: [] as { token: string; userId: string; values: unknown }[],
    staff: [] as { userId: string; values: unknown }[],
    revoked: [] as string[],
    deleted: [] as string[],
  };
  const deps: InviteDeps = {
    origins: readSiteOrigins("https://globaltoothgems.com", "http://localhost:3000"),
    caller: (token) => Promise.resolve(TOKENS[token] ?? null),
    staffRoleRank: (role) => Promise.resolve(RANKS[role] ?? null),
    findAccountByEmail: (email) => {
      calls.lookups += 1;
      return Promise.resolve(accounts.find((a) => a.email === email) ?? null);
    },
    findAccountById: (id) => {
      calls.lookups += 1;
      return Promise.resolve(accounts.find((a) => a.id === id) ?? null);
    },
    sendInvitation: (email, redirectTo) => {
      calls.sent.push({ email, redirectTo });
      return Promise.resolve({ userId: NEW_ID });
    },
    markInvitation: (id) => {
      calls.marked.push(id);
      return Promise.resolve();
    },
    assignRoleAsCaller: (token, userId, values) => {
      calls.roles.push({ token, userId, values });
      return Promise.resolve(null);
    },
    saveStaffProfileAsCaller: (_token, userId, values) => {
      calls.staff.push({ userId, values });
      return Promise.resolve(null);
    },
    revokeAsCaller: (_token, userId) => {
      calls.revoked.push(userId);
      return Promise.resolve(null);
    },
    deleteAccount: (id) => {
      calls.deleted.push(id);
      return Promise.resolve();
    },
    log: () => {},
    ...overrides,
  };
  return { deps, calls };
}

function post(body: unknown, token: string | null = "admin.jwt.sig", origin = "https://globaltoothgems.com") {
  const headers: Record<string, string> = { "content-type": "application/json", origin };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://x.supabase.co/functions/v1/invite-staff-member", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

Deno.test("invites a new address: e-mail sent, role and staff row written with the caller's JWT", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleStaffInvite(post(INVITE), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "invited", user_id: NEW_ID });
  assertEquals(calls.sent, [{ email: "nora.martin@example.com", redirectTo: invitationRedirect("https://globaltoothgems.com") }]);
  assertEquals(calls.marked, [NEW_ID]);
  assertEquals(calls.roles, [{ token: "admin.jwt.sig", userId: NEW_ID, values: { role: "manager", first_name: "Nora", last_name: "Martin" } }]);
  assertEquals(calls.staff, [{ userId: NEW_ID, values: { team: "customer_care", job_title: "Responsable service client" } }]);
});

Deno.test("the invitation link lands on /auth/confirm of an allowed origin only", async () => {
  assertEquals(
    invitationRedirect("https://globaltoothgems.com"),
    "https://globaltoothgems.com/auth/confirm?next=%2Freinitialiser-mot-de-passe",
  );
  const local = fakeDeps();
  await handleStaffInvite(post(INVITE, "admin.jwt.sig", "http://localhost:3000"), local.deps);
  assert(local.calls.sent[0].redirectTo.startsWith("http://localhost:3000/auth/confirm?"));
  const evil = fakeDeps();
  const res = await handleStaffInvite(post(INVITE, "admin.jwt.sig", "https://evil.example"), evil.deps);
  assert(evil.calls.sent[0].redirectTo.startsWith("https://globaltoothgems.com/auth/confirm?"));
  assertEquals(res.headers.get("access-control-allow-origin"), null);
});

Deno.test("refused without manage_users, and nothing is looked up", async () => {
  const { deps, calls } = fakeDeps({}, [account()]);
  for (const body of [INVITE, { action: "resend", user_id: PENDING.id }, { action: "cancel", user_id: PENDING.id }]) {
    const res = await handleStaffInvite(post(body, "viewer.jwt.sig"), deps);
    assertEquals(res.status, 403);
    assertEquals(await res.json(), { error: "forbidden" });
  }
  assertEquals(calls.lookups, 0);
  assertEquals(calls.sent.length, 0);
});

Deno.test("refused without a valid user token (missing, publishable key, expired)", async () => {
  const { deps, calls } = fakeDeps();
  for (const token of [null, "sb_publishable_abc", "expired.jwt.sig"]) {
    const res = await handleStaffInvite(post(INVITE, token), deps);
    assertEquals(res.status, 401);
    assertEquals(await res.json(), { error: "unauthorized" });
  }
  assertEquals(calls.sent.length + calls.lookups, 0);
});

Deno.test("a manager cannot invite an administrator: refused before any e-mail", async () => {
  const { deps, calls } = fakeDeps();
  const res = await handleStaffInvite(post({ ...INVITE, role: "admin" }, "manager.jwt.sig"), deps);
  assertEquals(res.status, 403);
  assertEquals(await res.json(), { error: "rank_forbidden" });
  assertEquals(calls.sent.length + calls.roles.length + calls.lookups, 0);
  // A manager may invite a manager.
  const ok = fakeDeps();
  assertEquals((await handleStaffInvite(post(INVITE, "manager.jwt.sig"), ok.deps)).status, 200);
});

Deno.test("invalid input is refused with the offending field", async () => {
  const cases: [unknown, string][] = [
    ["{", "body"],
    [{ ...INVITE, email: "not-an-email" }, "email"],
    [{ ...INVITE, role: "customer" }, "role"],
    [{ ...INVITE, role: "owner" }, "role"],
    [{ ...INVITE, team: "sales" }, "team"],
    [{ ...INVITE, first_name: "  " }, "first_name"],
    [{ ...INVITE, last_name: "x".repeat(101) }, "last_name"],
    [{ ...INVITE, job_title: "line\nbreak" }, "job_title"],
    [{ ...INVITE, status: "active" }, "status"],
    [{ action: "resend", user_id: "42" }, "user_id"],
    [{ action: "delete", user_id: PENDING.id }, "action"],
  ];
  for (const [body, field] of cases) {
    const { deps, calls } = fakeDeps();
    const res = await handleStaffInvite(post(body), deps);
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(await res.json(), { error: "invalid_request", field });
    assertEquals(calls.sent.length + calls.lookups, 0);
  }
  const { deps } = fakeDeps();
  assertEquals((await handleStaffInvite(new Request("https://x/f", { method: "GET" }), deps)).status, 405);
});

Deno.test("an existing customer is promoted without an e-mail; their own names are kept", async () => {
  const customer = account();
  const { deps, calls } = fakeDeps({}, [customer]);
  const res = await handleStaffInvite(post(INVITE), deps);
  assertEquals(await res.json(), { status: "promoted", user_id: customer.id });
  assertEquals(calls.sent.length, 0);
  assertEquals(calls.roles[0].values, { role: "manager", last_name: "Martin" });
  // A suspended customer is not promoted silently.
  const suspended = fakeDeps({}, [account({ status: "suspended" })]);
  const refused = await handleStaffInvite(post(INVITE), suspended.deps);
  assertEquals(refused.status, 409);
  assertEquals(await refused.json(), { error: "account_unavailable" });
});

Deno.test("an existing team member is not invited again; a retried pending invitation is idempotent", async () => {
  const member = account({ role: "viewer", roleRank: 10, roleIsStaff: true });
  const taken = fakeDeps({}, [member]);
  const res = await handleStaffInvite(post(INVITE), taken.deps);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "already_member" });
  assertEquals(taken.calls.sent.length + taken.calls.roles.length, 0);

  const retried = fakeDeps({}, [PENDING]);
  const again = await handleStaffInvite(post(INVITE), retried.deps);
  assertEquals(await again.json(), { status: "invited", user_id: PENDING.id });
  assertEquals(retried.calls.sent.length + retried.calls.roles.length, 0);
});

Deno.test("a role write refused by the database rolls the new account back", async () => {
  const refusal: DbError = { code: "42501", message: "profiles: you cannot manage or assign a role above your own" };
  const { deps, calls } = fakeDeps({ assignRoleAsCaller: () => Promise.resolve(refusal) });
  const res = await handleStaffInvite(post(INVITE), deps);
  assertEquals(res.status, 403);
  const text = await res.text();
  assertEquals(JSON.parse(text), { error: "rank_forbidden" });
  assert(!text.includes("profiles"), "no SQL message leaks");
  assertEquals(calls.deleted, [NEW_ID]);
  assertEquals(calls.staff.length, 0);
});

Deno.test("Auth failures map to codes without leaking the provider message", async () => {
  const limited = fakeDeps({ sendInvitation: () => Promise.resolve({ error: "rate_limited" }) });
  assertEquals((await handleStaffInvite(post(INVITE), limited.deps)).status, 429);
  const broken = fakeDeps({ sendInvitation: () => Promise.resolve({ error: "failed", detail: "500 smtp: relay refused" }) });
  const res = await handleStaffInvite(post(INVITE), broken.deps);
  assertEquals(res.status, 500);
  assertEquals(await res.text(), JSON.stringify({ error: "server_error" }));
  const down = fakeDeps({ findAccountByEmail: () => Promise.reject(new Error("connection refused")) });
  assertEquals(await (await handleStaffInvite(post(INVITE), down.deps)).json(), { error: "server_error" });
});

Deno.test("resend: pending invitations only, within the caller's rank", async () => {
  const adminInvite = { ...PENDING, id: "dddddddd-0000-4000-8000-000000000002", role: "admin", roleRank: 30 };
  const active = account({ id: "dddddddd-0000-4000-8000-000000000003", role: "viewer", roleRank: 10, roleIsStaff: true });
  const customer = account({ id: "dddddddd-0000-4000-8000-000000000004" });
  const { deps, calls } = fakeDeps({}, [PENDING, adminInvite, active, customer]);
  const send = (id: string, token = "admin.jwt.sig") => handleStaffInvite(post({ action: "resend", user_id: id }, token), deps);

  assertEquals(await (await send(PENDING.id)).json(), { status: "resent", user_id: PENDING.id });
  assertEquals(calls.sent.map((s) => s.email), [PENDING.email]);
  assertEquals((await send(adminInvite.id, "manager.jwt.sig")).status, 403);
  assertEquals(await (await send(active.id)).json(), { error: "not_pending" });
  // A customer id answers like an unknown one.
  assertEquals(await (await send(customer.id)).json(), { error: "not_found" });
  assertEquals(await (await send("eeeeeeee-0000-4000-8000-000000000009")).json(), { error: "not_found" });
  assertEquals(calls.sent.length, 1);
});

Deno.test("cancel: withdraws an unused invitation created here, never a promoted account", async () => {
  const promoted = { ...PENDING, id: "dddddddd-0000-4000-8000-000000000005", createdByInvitation: false };
  const { deps, calls } = fakeDeps({}, [PENDING, promoted]);
  const cancel = (id: string, token = "admin.jwt.sig") => handleStaffInvite(post({ action: "cancel", user_id: id }, token), deps);

  assertEquals(await (await cancel(promoted.id)).json(), { error: "not_pending" });
  assertEquals(await (await cancel(PENDING.id)).json(), { status: "cancelled", user_id: PENDING.id });
  assertEquals(calls.revoked, [PENDING.id]);
  assertEquals(calls.deleted, [PENDING.id]);

  // Refused by the database (rank / permission): nothing deleted.
  const refused = fakeDeps({ revokeAsCaller: () => Promise.resolve({ code: "42501", message: "staff_profiles: you cannot manage a member above your own role" }) }, [PENDING]);
  const res = await handleStaffInvite(post({ action: "cancel", user_id: PENDING.id }), refused.deps);
  assertEquals(res.status, 403);
  assertEquals(refused.calls.deleted.length, 0);
});

Deno.test("nobody acts on their own account through this function", async () => {
  const self = { ...PENDING, id: ADMIN.userId };
  const { deps, calls } = fakeDeps({}, [self]);
  const res = await handleStaffInvite(post({ action: "cancel", user_id: ADMIN.userId }), deps);
  assertEquals(res.status, 403);
  assertEquals(calls.deleted.length, 0);
});
