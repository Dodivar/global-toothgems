import { describe, expect, it } from "vitest";
import { createGoogleNonce } from "./googleIdentity";

describe("createGoogleNonce", () => {
  it("returns a raw nonce and its SHA-256 hex", async () => {
    const { raw, hashed } = await createGoogleNonce();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const expected = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    expect(hashed).toBe(expected);
  });

  it("is different each time", async () => {
    expect((await createGoogleNonce()).raw).not.toBe((await createGoogleNonce()).raw);
  });
});
