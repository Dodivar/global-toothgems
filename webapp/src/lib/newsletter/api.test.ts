import { describe, expect, it } from "vitest";
import { CONFIRM_TOKEN_RE, NEWSLETTER_EMAIL_RE, confirmNewsletter, subscribeToNewsletter } from "./api";

// The unit tests run without a Supabase project: the module must never pretend.
describe("newsletter boundary without a backend", () => {
  it("never reports a sign-up as done", async () => {
    await expect(
      subscribeToNewsletter({ email: "ana@example.com", locale: "fr", source: "home", consent: true, website: "" }),
    ).resolves.toEqual({ ok: false, error: "unavailable" });
  });

  it("refuses a malformed link before asking anyone, and never confirms without the database", async () => {
    await expect(confirmNewsletter("")).resolves.toBe("invalid");
    await expect(confirmNewsletter("ab".repeat(23))).resolves.toBe("invalid");
    await expect(confirmNewsletter("AB".repeat(24))).resolves.toBe("invalid");
    await expect(confirmNewsletter("ab".repeat(24))).resolves.toBe("unavailable");
  });
});

describe("shapes", () => {
  it("matches the token the database issues (24 random bytes in hex)", () => {
    expect(CONFIRM_TOKEN_RE.test("0f".repeat(24))).toBe(true);
    expect(CONFIRM_TOKEN_RE.test("0f".repeat(24) + "0")).toBe(false);
  });

  it("checks the e-mail like the form", () => {
    expect(NEWSLETTER_EMAIL_RE.test("ana@example.com")).toBe(true);
    expect(NEWSLETTER_EMAIL_RE.test("ana@example")).toBe(false);
    expect(NEWSLETTER_EMAIL_RE.test("ana @example.com")).toBe(false);
  });
});
