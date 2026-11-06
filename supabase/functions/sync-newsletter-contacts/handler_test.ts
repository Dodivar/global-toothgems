import { assertEquals } from "jsr:@std/assert@1";
import {
  ALL_SEGMENT,
  handleSyncNewsletterContacts,
  type PendingContact,
  syncNewsletterContacts,
  type SyncStore,
  wantedSegments,
} from "./handler.ts";
import { type ContactsApi, ResendApiError, type Segment } from "./resendContacts.ts";

/** An in-memory Resend. */
function fakeResend(seed: { segments?: Segment[]; contacts?: Record<string, { firstName: string | null; unsubscribed: boolean; segments: string[] }> } = {}) {
  const segments: Segment[] = [...(seed.segments ?? [])];
  const contacts = new Map(Object.entries(seed.contacts ?? {}).map(([k, v]) => [k, { ...v, segments: [...v.segments] }]));
  const calls: string[] = [];
  let next = 1;
  const api: ContactsApi = {
    listSegments: () => (calls.push("listSegments"), Promise.resolve([...segments])),
    createSegment: (name) => {
      calls.push(`createSegment ${name}`);
      const s = { id: `seg_${next++}`, name };
      segments.push(s);
      return Promise.resolve(s);
    },
    getContact: (email) => {
      const c = contacts.get(email);
      return Promise.resolve(c ? { id: `c_${email}`, firstName: c.firstName, unsubscribed: c.unsubscribed } : null);
    },
    createContact: ({ email, firstName, segmentIds }) => {
      calls.push(`create ${email}`);
      contacts.set(email, { firstName, unsubscribed: false, segments: [...segmentIds] });
      return Promise.resolve();
    },
    setFirstName: (email, firstName) => {
      calls.push(`firstName ${email}`);
      contacts.get(email)!.firstName = firstName;
      return Promise.resolve();
    },
    deleteContact: (email) => {
      calls.push(`delete ${email}`);
      return Promise.resolve(contacts.delete(email));
    },
    contactSegments: (email) =>
      Promise.resolve((contacts.get(email)?.segments ?? []).map((id) => segments.find((s) => s.id === id)!)),
    addToSegment: (email, id) => {
      calls.push(`add ${email} ${id}`);
      contacts.get(email)!.segments.push(id);
      return Promise.resolve();
    },
    removeFromSegment: (email, id) => {
      calls.push(`remove ${email} ${id}`);
      const c = contacts.get(email)!;
      c.segments = c.segments.filter((s) => s !== id);
      return Promise.resolve();
    },
  };
  const segmentNames = (email: string) => (contacts.get(email)?.segments ?? []).map((id) => segments.find((s) => s.id === id)!.name).sort();
  return { api, contacts, segments, calls, segmentNames };
}

function fakeStore(rows: PendingContact[]) {
  const records: [string, string, string | null][] = [];
  const store: SyncStore = {
    pending: (limit) => Promise.resolve(rows.slice(0, limit)),
    record: (id, due, error) => (records.push([id, due, error]), Promise.resolve()),
  };
  return { store, records };
}

const row = (over: Partial<PendingContact> = {}): PendingContact => ({
  id: "row-1",
  email: "ana@example.com",
  subscribed: true,
  locale: "fr",
  firstName: "Ana",
  tags: [],
  dueAt: "2026-11-06T18:00:00.123456+00:00",
  ...over,
});
const noLog = () => {};

Deno.test("segments wanted: everyone, the language, the marketing tags only", () => {
  assertEquals(wantedSegments({ locale: "en", tags: ["vip", "follow_up", "training_completed"] }), [
    ALL_SEGMENT,
    "Newsletter — English",
    "Clients — VIP",
    "Academy — certifiés",
  ]);
  assertEquals(wantedSegments({ locale: "de", tags: [] }), [ALL_SEGMENT, "Newsletter — français"]);
});

Deno.test("a new subscriber is created in its segments, which are created once", async () => {
  const r = fakeResend({ segments: [{ id: "seg_team", name: "Salon Paris (fait main)" }] });
  const { store, records } = fakeStore([row({ tags: ["vip"] }), row({ id: "row-2", email: "bo@example.com", firstName: null })]);
  const report = await syncNewsletterContacts(r.api, store, 25, noLog);
  assertEquals(report, { synced: 0, created: 2, deleted: 0, failed: 0, unsubscribedInResend: 0, segmentsCreated: 3 });
  assertEquals(r.segmentNames("ana@example.com"), ["Clients — VIP", "Newsletter — français", ALL_SEGMENT].sort());
  assertEquals(r.contacts.get("ana@example.com")?.firstName, "Ana");
  assertEquals(r.contacts.get("bo@example.com")?.firstName, null);
  assertEquals(r.calls.filter((c) => c === "listSegments").length, 1);
  assertEquals(records, [["row-1", row().dueAt, null], ["row-2", row().dueAt, null]]);
});

Deno.test("an existing contact gets its managed segments right, the team's own are left alone", async () => {
  const r = fakeResend({
    segments: [
      { id: "s_all", name: ALL_SEGMENT },
      { id: "s_fr", name: "Newsletter — français" },
      { id: "s_en", name: "Newsletter — English" },
      { id: "s_vip", name: "Clients — VIP" },
      { id: "s_team", name: "Salon Paris (fait main)" },
    ],
    contacts: { "ana@example.com": { firstName: "Old", unsubscribed: false, segments: ["s_all", "s_fr", "s_vip", "s_team"] } },
  });
  const { store } = fakeStore([row({ locale: "en", tags: [] })]);
  const report = await syncNewsletterContacts(r.api, store, 25, noLog);
  assertEquals([report.synced, report.created, report.segmentsCreated], [1, 0, 0]);
  assertEquals(r.segmentNames("ana@example.com"), [ALL_SEGMENT, "Newsletter — English", "Salon Paris (fait main)"].sort());
  assertEquals(r.contacts.get("ana@example.com")?.firstName, "Ana");
});

Deno.test("a contact who unsubscribed in Resend is never set back to subscribed", async () => {
  const r = fakeResend({
    segments: [{ id: "s_all", name: ALL_SEGMENT }, { id: "s_fr", name: "Newsletter — français" }],
    contacts: { "ana@example.com": { firstName: "Ana", unsubscribed: true, segments: ["s_all", "s_fr"] } },
  });
  const { store } = fakeStore([row()]);
  const report = await syncNewsletterContacts(r.api, store, 25, noLog);
  assertEquals(report.unsubscribedInResend, 1);
  assertEquals(r.contacts.get("ana@example.com")?.unsubscribed, true);
  assertEquals(r.calls.filter((c) => c.startsWith("create")), []);
});

Deno.test("anyone no longer subscribed leaves Resend; already gone is fine", async () => {
  const r = fakeResend({ contacts: { "ana@example.com": { firstName: "Ana", unsubscribed: false, segments: [] } } });
  const { store, records } = fakeStore([row({ subscribed: false }), row({ id: "row-2", email: "gone@example.com", subscribed: false })]);
  const report = await syncNewsletterContacts(r.api, store, 25, noLog);
  assertEquals([report.deleted, report.failed], [1, 0]);
  assertEquals(r.contacts.has("ana@example.com"), false);
  assertEquals(records.map((x) => x[2]), [null, null]);
  assertEquals(r.calls.includes("listSegments"), false);
});

Deno.test("one failing contact is recorded and the run goes on; a refused key stops it", async () => {
  const r = fakeResend();
  const failing = { ...r.api, getContact: (email: string) => email === "bad@example.com" ? Promise.reject(new ResendApiError("boom", 500)) : r.api.getContact(email) };
  const logs: unknown[] = [];
  const one = fakeStore([row({ id: "bad", email: "bad@example.com" }), row()]);
  const report = await syncNewsletterContacts(failing, one.store, 25, (m, d) => logs.push([m, d]));
  assertEquals([report.failed, report.created], [1, 1]);
  assertEquals(one.records[0], ["bad", row().dueAt, "boom"]);
  assertEquals(JSON.stringify(logs).includes("bad@example.com"), false);

  const refused = { ...r.api, listSegments: () => Promise.reject(new ResendApiError("restricted key", 401)) };
  const two = fakeStore([row({ id: "a" }), row({ id: "b" })]);
  const stopped = await syncNewsletterContacts(refused, two.store, 25, noLog);
  assertEquals([stopped.failed, stopped.stopped], [1, "resend_forbidden"]);
  assertEquals(two.records.length, 1);
  assertEquals(two.records[0][2], "resend_forbidden: restricted key");
});

Deno.test("the endpoint needs the internal secret and validates the limit", async () => {
  const deps = {
    secret: "s3cret",
    run: (limit: number) => Promise.resolve({ synced: limit, created: 0, deleted: 0, failed: 0, unsubscribedInResend: 0, segmentsCreated: 0 }),
    log: noLog,
  };
  const post = (body: string, secret = "s3cret") =>
    new Request("https://x/f", { method: "POST", headers: { "x-internal-secret": secret, "content-type": "application/json" }, body });
  assertEquals((await handleSyncNewsletterContacts(post("{}", "nope"), deps)).status, 401);
  assertEquals((await handleSyncNewsletterContacts(new Request("https://x/f"), deps)).status, 405);
  assertEquals((await handleSyncNewsletterContacts(post('{"limit":0}'), deps)).status, 400);
  const ok = await handleSyncNewsletterContacts(post('{"limit":7}'), deps);
  assertEquals((await ok.json()).report.synced, 7);
  const dflt = await handleSyncNewsletterContacts(post("{}"), deps);
  assertEquals((await dflt.json()).report.synced, 25);
});
