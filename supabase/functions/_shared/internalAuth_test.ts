import { assertEquals } from "jsr:@std/assert@1";
import { hasInternalSecret } from "./internalAuth.ts";

/**
 * The lock of every function deployed with verify_jwt = false that pg_cron or
 * the Next.js server calls (e-mail sweep, gift card delivery, storage purge,
 * newsletter sync, send-email): a mistake here opens them to the internet.
 */

const SECRET = "s3cr3t-internal-value-0123456789";
const req = (value?: string) =>
  new Request("https://fn.example/x", { method: "POST", headers: value === undefined ? {} : { "x-internal-secret": value } });

Deno.test("the right secret authenticates", async () => {
  assertEquals(await hasInternalSecret(req(SECRET), SECRET), true);
  // The configured value is trimmed (a secret pasted with a newline still works).
  assertEquals(await hasInternalSecret(req(SECRET), `  ${SECRET}\n`), true);
});

Deno.test("no header, an empty header or a wrong secret is refused", async () => {
  assertEquals(await hasInternalSecret(req(), SECRET), false);
  assertEquals(await hasInternalSecret(req(""), SECRET), false);
  assertEquals(await hasInternalSecret(req("wrong"), SECRET), false);
  assertEquals(await hasInternalSecret(req(SECRET.slice(0, -1)), SECRET), false);
  assertEquals(await hasInternalSecret(req(`${SECRET}x`), SECRET), false);
  assertEquals(await hasInternalSecret(req(SECRET.toUpperCase()), SECRET), false);
});

Deno.test("an unset or blank configured secret never authenticates anyone, not even an empty header", async () => {
  for (const configured of [undefined, "", "   ", "\n"]) {
    assertEquals(await hasInternalSecret(req(), configured), false);
    assertEquals(await hasInternalSecret(req(""), configured), false);
    assertEquals(await hasInternalSecret(req(" "), configured), false);
    assertEquals(await hasInternalSecret(req("anything"), configured), false);
  }
});

Deno.test("the secret is read from x-internal-secret only, never from Authorization", async () => {
  const viaBearer = new Request("https://fn.example/x", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } });
  assertEquals(await hasInternalSecret(viaBearer, SECRET), false);
});
