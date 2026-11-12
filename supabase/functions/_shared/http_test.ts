import { assertEquals } from "jsr:@std/assert@1";
import { bearer, callerJwt, looksLikeJwt } from "./http.ts";

const withAuth = (value?: string) => new Request("https://x.test", { method: "POST", headers: value ? { authorization: value } : {} });
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

Deno.test("bearer reads the Authorization: Bearer token, case-insensitive scheme", () => {
  assertEquals(bearer(withAuth(`Bearer ${JWT}`)), JWT);
  assertEquals(bearer(withAuth(`bearer ${JWT}`)), JWT);
  assertEquals(bearer(withAuth("Basic abc")), null);
  assertEquals(bearer(withAuth("Bearer a b")), null);
  assertEquals(bearer(withAuth()), null);
});

Deno.test("callerJwt keeps a JWT and refuses the publishable key", () => {
  assertEquals(looksLikeJwt(JWT), true);
  assertEquals(looksLikeJwt("sb_publishable_abc"), false);
  assertEquals(callerJwt(withAuth(`Bearer ${JWT}`)), JWT);
  assertEquals(callerJwt(withAuth("Bearer sb_publishable_abc")), null);
  assertEquals(callerJwt(withAuth()), null);
});
