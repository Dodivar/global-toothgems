import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { ResendApiError, resendContactsApi } from "./resendContacts.ts";

type Seen = { method: string; url: string; body: unknown; auth: string | null };

function fakeFetch(answers: ((req: Seen) => Response | undefined)[]) {
  const seen: Seen[] = [];
  const doFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const req: Seen = {
      method: init?.method ?? "GET",
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get("Authorization"),
    };
    seen.push(req);
    const answer = answers.shift()?.(req);
    return answer ?? new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;
  return { doFetch, seen };
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const noSleep = () => Promise.resolve();

Deno.test("segments are listed page by page", async () => {
  const { doFetch, seen } = fakeFetch([
    () => jsonResponse({ object: "list", has_more: true, data: [{ id: "s1", name: "A" }] }),
    () => jsonResponse({ object: "list", has_more: false, data: [{ id: "s2", name: "B" }] }),
  ]);
  const api = resendContactsApi({ apiKey: "re_x", fetch: doFetch, sleep: noSleep });
  assertEquals(await api.listSegments(), [{ id: "s1", name: "A" }, { id: "s2", name: "B" }]);
  assertEquals(seen.map((s) => s.url), ["https://api.resend.com/segments?limit=100", "https://api.resend.com/segments?limit=100&after=s1"]);
  assertEquals(seen[0].auth, "Bearer re_x");
});

Deno.test("contacts are addressed by e-mail, created with their segments", async () => {
  const { doFetch, seen } = fakeFetch([
    () => jsonResponse({ message: "Contact not found" }, 404),
    () => jsonResponse({ object: "contact", id: "c1" }, 201),
    () => jsonResponse({ object: "contact", id: "c1", first_name: "Ana", unsubscribed: true }),
    () => jsonResponse({ deleted: true }),
    () => jsonResponse({ message: "not found" }, 404),
  ]);
  const api = resendContactsApi({ apiKey: "re_x", fetch: doFetch, sleep: noSleep });
  assertEquals(await api.getContact("a+b@example.com"), null);
  await api.createContact({ email: "a+b@example.com", firstName: null, segmentIds: ["s1", "s2"] });
  assertEquals(await api.getContact("a+b@example.com"), { id: "c1", firstName: "Ana", unsubscribed: true });
  assertEquals(await api.deleteContact("a+b@example.com"), true);
  assertEquals(await api.deleteContact("a+b@example.com"), false);
  assertEquals(seen[0].url, "https://api.resend.com/contacts/a%2Bb%40example.com");
  assertEquals(seen[1].body, { email: "a+b@example.com", unsubscribed: false, segments: [{ id: "s1" }, { id: "s2" }] });
  assertEquals(seen[3].method, "DELETE");
});

Deno.test("a 429 is retried once after Retry-After; other errors carry their status", async () => {
  const waits: number[] = [];
  const sleep = (ms: number) => (waits.push(ms), Promise.resolve());
  const { doFetch } = fakeFetch([
    () => jsonResponse({ message: "slow down" }, 429, { "retry-after": "2" }),
    () => jsonResponse({ object: "segment", id: "s9" }, 201),
    () => jsonResponse({ message: "This API key is restricted to only send emails" }, 401),
  ]);
  const api = resendContactsApi({ apiKey: "re_x", fetch: doFetch, sleep, minGapMs: 0 });
  assertEquals(await api.createSegment("X"), { id: "s9", name: "X" });
  assertEquals(waits.includes(2000), true);
  const error = await assertRejects(() => api.listSegments(), ResendApiError);
  assertEquals(error.status, 401);
});

Deno.test("requests are paced", async () => {
  const waits: number[] = [];
  const { doFetch } = fakeFetch([]);
  const api = resendContactsApi({ apiKey: "re_x", fetch: doFetch, sleep: (ms) => (waits.push(ms), Promise.resolve()), minGapMs: 500 });
  await api.addToSegment("a@example.com", "s1");
  await api.addToSegment("a@example.com", "s2");
  assertEquals(waits.length, 1);
  assertEquals(waits[0] > 400 && waits[0] <= 500, true);
});
