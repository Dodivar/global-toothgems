import { assertEquals, assertObjectMatch } from "jsr:@std/assert@1";
import { type Claim, type ClaimEntry, type EmailDeps, type EmailStore, hashAddress, sendTemplatedEmail } from "./send.ts";
import type { TemplateRow } from "./render.ts";

const TEMPLATE: TemplateRow = {
  locale: "fr",
  subject: "Commande {{order_number}}",
  preheader: null,
  body: "Bonjour {{first_name}}",
  variables: ["order_number", "first_name"],
};

interface Harness {
  deps: EmailDeps;
  calls: { claims: ClaimEntry[]; sent: [string, string][]; failed: [string, string][]; requests: Request[] };
}

function harness(options: {
  template?: TemplateRow | null;
  claim?: Claim;
  resend?: (request: Request) => Response;
} = {}): Harness {
  const calls: Harness["calls"] = { claims: [], sent: [], failed: [], requests: [] };
  const store: EmailStore = {
    loadTemplate: () => Promise.resolve(options.template === undefined ? TEMPLATE : options.template),
    claim: (entry) => {
      calls.claims.push(entry);
      return Promise.resolve(options.claim ?? { claimed: true, attempt: 1 });
    },
    markSent: (key, id) => {
      calls.sent.push([key, id]);
      return Promise.resolve();
    },
    markFailed: (key, error) => {
      calls.failed.push([key, error]);
      return Promise.resolve();
    },
  };
  const fetchStub: typeof fetch = (input, init) => {
    const request = new Request(input as string, init);
    calls.requests.push(request);
    return Promise.resolve(options.resend ? options.resend(request) : Response.json({ id: "em_1" }));
  };
  return {
    calls,
    deps: {
      store,
      resend: { apiKey: "re_test", fetch: fetchStub },
      from: "Global Tooth Gems <no-reply@globaltoothgems.com>",
      layout: { brandName: "Global Tooth Gems", siteUrl: "https://globaltoothgems.com" },
    },
  };
}

const REQUEST = {
  templateKey: "order_confirmation",
  to: "Camille@Example.com",
  locale: "fr",
  variables: { order_number: "GT-1042", first_name: "Camille" },
  eventKey: "order_confirmation:o1",
  orderId: "o1",
};

Deno.test("renders, claims, sends with the attempt in the idempotency key, records the id", async () => {
  const { deps, calls } = harness();
  const result = await sendTemplatedEmail(deps, REQUEST);
  assertEquals(result, { status: "sent", id: "em_1" });
  assertEquals(calls.requests.length, 1);
  assertEquals(calls.requests[0].headers.get("idempotency-key"), "order_confirmation:o1:1");
  const body = await calls.requests[0].json();
  assertObjectMatch(body, { to: ["Camille@Example.com"], subject: "Commande GT-1042" });
  assertEquals(calls.sent, [["order_confirmation:o1", "em_1"]]);
  assertEquals(calls.claims[0].recipientHash, await hashAddress("camille@example.com"));
  assertEquals(calls.claims[0].orderId, "o1");
});

Deno.test("an event already sent (or in flight) sends nothing", async () => {
  const { deps, calls } = harness({ claim: { claimed: false, status: "sent" } });
  assertEquals(await sendTemplatedEmail(deps, REQUEST), { status: "duplicate", previous: "sent" });
  assertEquals(calls.requests.length, 0);
});

Deno.test("a retry after a failure uses the next attempt's key", async () => {
  const { deps, calls } = harness({ claim: { claimed: true, attempt: 2 } });
  await sendTemplatedEmail(deps, REQUEST);
  assertEquals(calls.requests[0].headers.get("idempotency-key"), "order_confirmation:o1:2");
});

Deno.test("a Resend failure is recorded and reported with its retryability", async () => {
  const { deps, calls } = harness({ resend: () => Response.json({ message: "Domain not verified" }, { status: 403 }) });
  const result = await sendTemplatedEmail(deps, REQUEST);
  assertEquals(result.status, "failed");
  assertEquals(result.status === "failed" && result.retryable, false);
  assertEquals(calls.failed.length, 1);
  assertEquals(calls.sent.length, 0);

  const transient = harness({ resend: () => Response.json({}, { status: 503 }) });
  const second = await sendTemplatedEmail(transient.deps, REQUEST);
  assertEquals(second.status === "failed" && second.retryable, true);
});

Deno.test("a missing template or a bad render claims nothing", async () => {
  const missing = harness({ template: null });
  assertEquals(await sendTemplatedEmail(missing.deps, REQUEST), { status: "template_missing" });
  assertEquals(missing.calls.claims.length, 0);

  const bad = harness();
  const result = await sendTemplatedEmail(bad.deps, { ...REQUEST, variables: { order_number: "GT-1" } });
  assertEquals(result.status, "invalid");
  assertEquals(bad.calls.claims.length, 0);
  assertEquals(bad.calls.requests.length, 0);
});

Deno.test("refuses a malformed recipient, event key or header before touching anything", async () => {
  for (const request of [
    { ...REQUEST, to: "not an address" },
    { ...REQUEST, to: "a@b.co, c@d.co" },
    { ...REQUEST, to: "a@b.co\r\nBcc: x@y.zz" },
    { ...REQUEST, eventKey: "" },
    { ...REQUEST, headers: { "List-Unsubscribe": "<https://x.example>\r\nBcc: spy@example.com" } },
  ]) {
    const { deps, calls } = harness();
    assertEquals((await sendTemplatedEmail(deps, request)).status, "invalid");
    assertEquals(calls.claims.length + calls.requests.length, 0);
  }
});

Deno.test("the address hash ignores case and surrounding spaces", async () => {
  assertEquals(await hashAddress("  Camille@Example.com "), await hashAddress("camille@example.com"));
});
