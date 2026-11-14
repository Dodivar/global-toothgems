import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The advertising category, the pixel and their legal wording exist only once
 * a pixel id is configured, and never in mock mode (`metaPixelConfig.ts`).
 */
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const config = await import("./metaPixelConfig");
  const consent = await import("./cookieConsent");
  const { COOKIE_POLICY } = await import("../data/legal/cookies");
  const { PRIVACY } = await import("../data/legal/privacy");
  return { config, consent, cookies: COOKIE_POLICY, privacy: PRIVACY };
}

const LIVE = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("advertising switch", () => {
  it("is off without a pixel id: no category, the policy says no advertising tracker", async () => {
    const { config, consent, cookies, privacy } = await load({ ...LIVE, NEXT_PUBLIC_META_PIXEL_ID: "" });
    expect(config.ADVERTISING_ENABLED).toBe(false);
    expect(consent.OPTIONAL_CATEGORIES).toEqual(["analytics"]);
    expect(cookies.sections.map((s) => s.id)).not.toContain("advertising");
    expect(JSON.stringify(privacy)).not.toContain("Meta Platforms");
  });

  it("is off in mock mode and with a malformed id", async () => {
    expect((await load({ NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_META_PIXEL_ID: "1234567890" })).config.ADVERTISING_ENABLED).toBe(false);
    expect((await load({ ...LIVE, NEXT_PUBLIC_META_PIXEL_ID: "abc<script>" })).config.META_PIXEL_ID).toBe("");
  });

  it("is on with a pixel id: the category is offered and both policies name Meta", async () => {
    const { config, consent, cookies, privacy } = await load({ ...LIVE, NEXT_PUBLIC_META_PIXEL_ID: "1234567890" });
    expect(config.ADVERTISING_ENABLED).toBe(true);
    expect(consent.OPTIONAL_CATEGORIES).toEqual(["analytics", "advertising"]);
    expect(cookies.sections.map((s) => s.id)).toContain("advertising");
    expect(JSON.stringify(cookies)).toContain("_fbp, _fbc");
    expect(JSON.stringify(privacy)).toContain("Meta Platforms Ireland");
  });
});
