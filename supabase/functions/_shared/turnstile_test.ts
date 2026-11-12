import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { verifyTurnstile } from "./turnstile.ts";

Deno.test("the token, the secret and the caller address go to siteverify; success is read", async () => {
  const seen: FormData[] = [];
  const fakeFetch = ((_url: string | URL | Request, init?: RequestInit) => {
    seen.push(init?.body as FormData);
    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
  }) as typeof fetch;
  assertEquals(await verifyTurnstile("sec", "tok", "203.0.113.7", fakeFetch), true);
  assertEquals([seen[0].get("secret"), seen[0].get("response"), seen[0].get("remoteip")], ["sec", "tok", "203.0.113.7"]);
});

Deno.test("a refused token is false; a Cloudflare error throws", async () => {
  const refused = (() => Promise.resolve(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })))) as typeof fetch;
  assertEquals(await verifyTurnstile("sec", "tok", null, refused), false);
  const down = (() => Promise.resolve(new Response("oops", { status: 500 }))) as typeof fetch;
  await assertRejects(() => verifyTurnstile("sec", "tok", null, down));
});
