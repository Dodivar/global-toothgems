import { assertEquals } from "jsr:@std/assert@1";
import { allowedUrl, fetchCalendar, handleCalendarImport, type ImportDeps, readCapped, runImport } from "./handler.ts";

const SECRET = "s3cret";
const ICS = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261120T130000Z\r\nDTEND:20261120T140000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

Deno.test("only public https addresses are fetched", () => {
  for (const ok of ["https://calendar.google.com/calendar/ical/x/private-y/basic.ics", "https://outlook.office365.com/owa/calendar/a/b/calendar.ics"]) {
    assertEquals(allowedUrl(ok), true, ok);
  }
  for (const bad of [
    "http://calendar.example.com/x.ics",
    "https://127.0.0.1/x.ics",
    "https://[::1]/x.ics",
    "https://localhost/x.ics",
    "https://db.internal/x.ics",
    "https://user:pass@calendar.example.com/x.ics",
    "https://calendar.example.com:8443/x.ics",
    "https://intranet/x.ics",
    "not a url",
  ]) {
    assertEquals(allowedUrl(bad), false, bad);
  }
});

Deno.test("redirects are checked like the address; size and content are checked", async () => {
  const redirectToLocal = (() => Promise.resolve(new Response(null, { status: 302, headers: { location: "https://localhost/x.ics" } }))) as typeof fetch;
  assertEquals(await fetchCalendar("https://calendar.example.com/x.ics", redirectToLocal), { error: "forbidden_host" });
  const html = (() => Promise.resolve(new Response("<html></html>", { status: 200 }))) as typeof fetch;
  assertEquals(await fetchCalendar("https://calendar.example.com/x.ics", html), { error: "not_calendar" });
  const missing = (() => Promise.resolve(new Response("no", { status: 404 }))) as typeof fetch;
  assertEquals(await fetchCalendar("https://calendar.example.com/x.ics", missing), { error: "unreachable" });
  const ok = (() => Promise.resolve(new Response(ICS, { status: 200 }))) as typeof fetch;
  assertEquals(await fetchCalendar("https://calendar.example.com/x.ics", ok), { text: ICS });
  assertEquals(await readCapped(new Response("x".repeat(20)), 10), null);
  const down = (() => Promise.reject(new TypeError("dns"))) as typeof fetch;
  assertEquals(await fetchCalendar("https://calendar.example.com/x.ics", down), { error: "unreachable" });
});

function deps(overrides: Partial<ImportDeps> = {}) {
  const applied: { user: string; hours: string[] | null; error: string | null }[] = [];
  const d: ImportDeps = {
    secret: SECRET,
    now: () => Date.parse("2026-11-16T00:00:00Z"),
    log: () => {},
    targets: () =>
      Promise.resolve([
        { userId: "u1", url: "https://calendar.example.com/a.ics", timezone: "Europe/Paris", horizonDays: 56 },
        { userId: "u2", url: "https://calendar.example.com/b.ics", timezone: "Europe/Paris", horizonDays: 56 },
      ]),
    fetchCalendar: (url) => Promise.resolve(url.endsWith("a.ics") ? { text: ICS } : { error: "timeout" as const }),
    apply: (t, hours, error) => {
      applied.push({ user: t.userId, hours, error });
      return Promise.resolve();
    },
    ...overrides,
  };
  return { d, applied };
}

Deno.test("each calendar read is applied; a failed read records its error", async () => {
  const { d, applied } = deps();
  assertEquals(await runImport(d), { examined: 2, applied: 1, failed: 1 });
  assertEquals(applied, [
    { user: "u1", hours: ["2026-11-20T13:00:00.000Z"], error: null },
    { user: "u2", hours: null, error: "timeout" },
  ]);
});

Deno.test("the shared secret is required", async () => {
  const { d } = deps();
  assertEquals((await handleCalendarImport(new Request("https://fn.example/x", { method: "POST" }), d)).status, 401);
  assertEquals((await handleCalendarImport(new Request("https://fn.example/x", { method: "GET" }), d)).status, 405);
  const ok = await handleCalendarImport(new Request("https://fn.example/x", { method: "POST", headers: { "x-internal-secret": SECRET } }), d);
  assertEquals(ok.status, 200);
  assertEquals((await ok.json()).report.examined, 2);
});
