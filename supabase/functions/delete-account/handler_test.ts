import { assertEquals } from "jsr:@std/assert@1";
import { readSiteOrigins } from "../_shared/http.ts";
import { type DeleteAccountDeps, type EraseResult, handleDeleteAccount, lastAuthenticatedAt } from "./handler.ts";

const SITE = "https://global-toothgems.example";
const NOW = new Date("2026-11-06T20:00:00Z");
const NOW_S = NOW.getTime() / 1000;

const b64url = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** A token shaped like Supabase's: only the payload matters here (Auth verifies the signature). */
const token = (amr: unknown) => `${b64url({ alg: "HS256" })}.${b64url({ sub: "user-1", amr })}.c2ln`;

const FRESH = token([{ method: "password", timestamp: NOW_S - 60 }]);
const STALE = token([{ method: "password", timestamp: NOW_S - 3600 }]);

interface Options {
  blockers?: string[];
  erase?: EraseResult;
  files?: { bucket: string; name: string }[];
  failRemove?: boolean;
  failConfirm?: boolean;
  failAnalytics?: boolean;
}

function fake(options: Options = {}) {
  const calls: string[] = [];
  const deps: DeleteAccountDeps = {
    origins: readSiteOrigins(SITE, undefined),
    memberFromToken: (t) => Promise.resolve(t === FRESH || t === STALE ? { id: "user-1", email: "member@example.com" } : null),
    blockers: () => Promise.resolve(options.blockers ?? []),
    recipient: (m) => Promise.resolve(m.email ? { email: m.email, locale: "fr" } : null),
    files: () => Promise.resolve(options.files ?? []),
    removeFiles: (bucket, names) => {
      calls.push(`remove ${bucket} ${names.length}`);
      return options.failRemove ? Promise.reject(new Error("storage down")) : Promise.resolve();
    },
    erase: (id) => {
      calls.push(`erase ${id}`);
      return Promise.resolve(options.erase ?? { status: "erased" });
    },
    confirm: (id, r) => {
      calls.push(`confirm ${id} ${r.email}`);
      return options.failConfirm ? Promise.reject(new Error("resend down")) : Promise.resolve();
    },
    forgetAnalytics: (id) => {
      calls.push(`forget analytics ${id}`);
      return options.failAnalytics ? Promise.reject(new Error("posthog down")) : Promise.resolve();
    },
    now: () => NOW,
    log: () => {},
  };
  return { deps, calls };
}

const post = (body: string, t: string | null = FRESH) =>
  new Request("https://fn.example/delete-account", {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body,
  });

const CONFIRM = '{"confirm":true}';

Deno.test("a recently signed-in member deletes their account: files, then the erasure, then the e-mail", async () => {
  const files = [
    ...Array.from({ length: 150 }, (_, i) => ({ bucket: "studio-thumbnails", name: `user-1/${i}.webp` })),
    { bucket: "avatars", name: "user-1/me.png" },
  ];
  const { deps, calls } = fake({ files });
  const res = await handleDeleteAccount(post(CONFIRM), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "deleted" });
  assertEquals(calls, [
    "remove studio-thumbnails 100",
    "remove studio-thumbnails 50",
    "remove avatars 1",
    "erase user-1",
    "forget analytics user-1",
    "confirm user-1 member@example.com",
  ]);
});

Deno.test("no token, an unknown token or a body that does not only confirm is refused before anything", async () => {
  const { deps, calls } = fake();
  assertEquals((await handleDeleteAccount(post(CONFIRM, null), deps)).status, 401);
  assertEquals((await handleDeleteAccount(post(CONFIRM, token([]).replace("c2ln", "eA")), deps)).status, 401);
  assertEquals((await handleDeleteAccount(post("{}"), deps)).status, 400);
  assertEquals((await handleDeleteAccount(post('{"confirm":"yes"}'), deps)).status, 400);
  assertEquals((await handleDeleteAccount(post('{"confirm":true,"user_id":"user-2"}'), deps)).status, 400);
  assertEquals(calls, []);
});

Deno.test("a sign-in older than 10 minutes asks the member to sign in again", async () => {
  const { deps, calls } = fake();
  const res = await handleDeleteAccount(post(CONFIRM, STALE), deps);
  assertEquals(res.status, 403);
  assertEquals(await res.json(), { error: "reauthentication_required" });
  assertEquals(calls, []);
});

Deno.test("a blocker stops everything, before any file is removed", async () => {
  const { deps, calls } = fake({ blockers: ["studio_subscription"], files: [{ bucket: "avatars", name: "user-1/a.png" }] });
  const res = await handleDeleteAccount(post(CONFIRM), deps);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "blocked", blockers: ["studio_subscription"] });
  assertEquals(calls, []);
});

Deno.test("a blocker appearing at the erasure itself is reported, and no e-mail goes out", async () => {
  const { deps, calls } = fake({ erase: { status: "blocked", blockers: ["order_payment_pending"] } });
  const res = await handleDeleteAccount(post(CONFIRM), deps);
  assertEquals(res.status, 409);
  assertEquals(calls, ["erase user-1"]);
});

Deno.test("a Storage failure leaves the account in place (500, calling again resumes)", async () => {
  const { deps, calls } = fake({ failRemove: true, files: [{ bucket: "avatars", name: "user-1/a.png" }] });
  const res = await handleDeleteAccount(post(CONFIRM), deps);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "server_error" });
  assertEquals(calls, ["remove avatars 1"]);
});

Deno.test("the account is gone even when the confirmation e-mail fails", async () => {
  const { deps } = fake({ failConfirm: true });
  assertEquals((await handleDeleteAccount(post(CONFIRM), deps)).status, 200);
});

Deno.test("the account is gone and the e-mail sent even when PostHog refuses the deletion", async () => {
  const { deps, calls } = fake({ failAnalytics: true });
  assertEquals((await handleDeleteAccount(post(CONFIRM), deps)).status, 200);
  assertEquals(calls, ["erase user-1", "forget analytics user-1", "confirm user-1 member@example.com"]);
});

Deno.test("an account already erased answers deleted without an e-mail", async () => {
  const { deps, calls } = fake({ erase: { status: "not_found" } });
  assertEquals((await handleDeleteAccount(post(CONFIRM), deps)).status, 200);
  assertEquals(calls, ["erase user-1"]);
});

Deno.test("lastAuthenticatedAt reads the newest amr timestamp, null otherwise", () => {
  assertEquals(lastAuthenticatedAt(token([{ method: "password", timestamp: 100 }, { method: "otp", timestamp: 250 }])), 250);
  assertEquals(lastAuthenticatedAt(token([])), null);
  assertEquals(lastAuthenticatedAt(token("password")), null);
  assertEquals(lastAuthenticatedAt("not-a-token"), null);
});
