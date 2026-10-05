import { assertEquals } from "jsr:@std/assert@1";
import { verifySvixSignature } from "./svix.ts";
import { sign, TEST_SECRET } from "./svix_testing.ts";

const NOW = new Date("2026-10-05T12:00:00Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

async function headers(body: string, overrides: Record<string, string> = {}): Promise<Headers> {
  return new Headers({
    "svix-id": "msg_1",
    "svix-timestamp": String(NOW_SECONDS),
    "svix-signature": await sign(body, "msg_1", NOW_SECONDS),
    ...overrides,
  });
}

const BODY = '{"type":"email.delivered","data":{"email_id":"abc"}}';

Deno.test("a correctly signed, fresh request is accepted", async () => {
  assertEquals(await verifySvixSignature(BODY, await headers(BODY), TEST_SECRET, NOW), true);
});

Deno.test("the secret may be given without the whsec_ prefix", async () => {
  assertEquals(await verifySvixSignature(BODY, await headers(BODY), TEST_SECRET.slice(6), NOW), true);
});

Deno.test("any valid entry of a rotation list is enough", async () => {
  const other = "whsec_" + btoa("ffffffffffffffffffffffffffffffff");
  const stale = await sign(BODY, "msg_1", NOW_SECONDS, other);
  const good = await sign(BODY, "msg_1", NOW_SECONDS);
  const h = await headers(BODY, { "svix-signature": `${stale} ${good}` });
  assertEquals(await verifySvixSignature(BODY, h, TEST_SECRET, NOW), true);
  const onlyStale = await headers(BODY, { "svix-signature": stale });
  assertEquals(await verifySvixSignature(BODY, onlyStale, TEST_SECRET, NOW), false);
});

Deno.test("a tampered body, id, or timestamp is refused", async () => {
  const h = await headers(BODY);
  assertEquals(await verifySvixSignature(BODY + " ", h, TEST_SECRET, NOW), false);
  h.set("svix-id", "msg_2");
  assertEquals(await verifySvixSignature(BODY, h, TEST_SECRET, NOW), false);
  const t = await headers(BODY, { "svix-timestamp": String(NOW_SECONDS + 1) });
  assertEquals(await verifySvixSignature(BODY, t, TEST_SECRET, NOW), false);
});

Deno.test("timestamps outside five minutes are refused, in both directions", async () => {
  for (const delta of [-301, 301, -3600, 3600]) {
    const ts = NOW_SECONDS + delta;
    const h = await headers(BODY, { "svix-timestamp": String(ts), "svix-signature": await sign(BODY, "msg_1", ts) });
    assertEquals(await verifySvixSignature(BODY, h, TEST_SECRET, NOW), false, String(delta));
  }
  const edge = NOW_SECONDS - 300;
  const h = await headers(BODY, { "svix-timestamp": String(edge), "svix-signature": await sign(BODY, "msg_1", edge) });
  assertEquals(await verifySvixSignature(BODY, h, TEST_SECRET, NOW), true);
});

Deno.test("missing headers, bad formats and a missing secret never verify", async () => {
  for (const name of ["svix-id", "svix-timestamp", "svix-signature"]) {
    const h = await headers(BODY);
    h.delete(name);
    assertEquals(await verifySvixSignature(BODY, h, TEST_SECRET, NOW), false, name);
  }
  for (const bad of ["v1,", "v2,AAAA", "garbage", "v1,%%%not-base64%%%", ""]) {
    const h = await headers(BODY, { "svix-signature": bad });
    assertEquals(await verifySvixSignature(BODY, h, TEST_SECRET, NOW), false, bad);
  }
  const nan = await headers(BODY, { "svix-timestamp": "abc" });
  assertEquals(await verifySvixSignature(BODY, nan, TEST_SECRET, NOW), false);
  assertEquals(await verifySvixSignature(BODY, await headers(BODY), undefined, NOW), false);
  assertEquals(await verifySvixSignature(BODY, await headers(BODY), "  ", NOW), false);
  assertEquals(await verifySvixSignature(BODY, await headers(BODY), "whsec_%%%", NOW), false);
});
